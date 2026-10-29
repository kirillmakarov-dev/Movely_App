using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlConsentTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    [SkippableFact]
    public async Task ConsentMigrationAppliesAndMatchesCurrentModel()
    {
        RequireDatabase();
        await using var db = fixture.CreateDbContext();
        Assert.Contains("20261029131325_AddVersionedConsentRecords", await db.Database.GetAppliedMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        await db.PolicyAcceptances.CountAsync();
        await db.ContactSharingAcceptances.CountAsync();
    }

    [SkippableFact]
    public async Task RegistrationAndConsentPersistAcrossContexts()
    {
        RequireDatabase();
        using var app = CreateApp();
        using var client = app.CreateClient();
        var credential = Credential();
        var rejected = await SignIn(client, credential, null);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        await using (var check = fixture.CreateDbContext())
            Assert.False(await check.Users.AnyAsync(x => x.Email == credential.Split(':')[2]));

        var response = await SignIn(client, credential, ConsentFixtures.Acceptance);
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        await using var db = fixture.CreateDbContext();
        var consent = await db.PolicyAcceptances.SingleAsync(x => x.UserId == user.Id);
        Assert.Equal(ConsentPolicy.Version, consent.TermsVersion);
        Assert.True(consent.AdultConfirmed);
        Assert.True(consent.IsTestOnly);
        Assert.True(await db.UserSessions.AnyAsync(x => x.UserId == user.Id));
    }

    [SkippableFact]
    public async Task FailedConsentSaveRollsBackPreviouslySavedUserAndIdentity()
    {
        RequireDatabase();
        using var app = CreateApp(new RejectPolicySave());
        using var client = app.CreateClient();
        var credential = Credential();
        var response = await SignIn(client, credential, ConsentFixtures.Acceptance);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        await using var db = fixture.CreateDbContext();
        Assert.False(await db.Users.AnyAsync(x => x.Email == credential.Split(':')[2]));
        Assert.False(await db.UserAuthIdentities.AnyAsync(x => x.ProviderSubject == credential.Split(':')[1]));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [SkippableFact]
    public async Task PublicationPersistsConsentAndRejectsDuplicateDatabaseRecord()
    {
        RequireDatabase();
        using var app = CreateApp();
        using var client = app.CreateClient();
        var signedIn = await SignIn(client, Credential(), ConsentFixtures.Acceptance);
        signedIn.EnsureSuccessStatusCode();
        var user = (await signedIn.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        await using (var db = fixture.CreateDbContext())
        {
            var storedUser = await db.Users.SingleAsync(x => x.Id == user.Id);
            storedUser.Phone = "+972501234567";
            storedUser.PhoneVerified = true;
            await db.SaveChangesAsync();
        }
        await Csrf(client);
        var create = await client.PostAsJsonAsync("/api/v1/move-requests", new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        create.EnsureSuccessStatusCode();
        var draft = (await create.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!;
        var location = new MoveLocationDto("Test City", "Test Street 1", 0, false, ElevatorFurnitureSuitability.Unknown, null, null, 5);
        var update = new UpdateMoveRequestRequest(MoveRequestType.SmallMove, location, location, null,
            [new MoveItemDto(MoveItemKind.SmallMoveItem, null, null, SmallMoveItemCategory.Furniture, "Desk", null, 1, 100, 60, 70, 15)],
            [], new MoveScheduleDto(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), PreferredMoveTime.Morning, MoveDateFlexibility.Exact),
            MoveBudgetBand.Unknown, "Synthetic integration test", []);
        var saved = await client.PutAsJsonAsync($"/api/v1/move-requests/{draft.Id}", update);
        saved.EnsureSuccessStatusCode();
        var rejected = await client.PostAsJsonAsync($"/api/v1/move-requests/{draft.Id}/publish", ConsentFixtures.Sharing with { ShareContacts = false });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        await using (var check = fixture.CreateDbContext())
        {
            Assert.Equal(MoveRequestStatus.Draft, (await check.MoveRequests.FindAsync(draft.Id))!.Status);
            Assert.False(await check.ContactSharingAcceptances.AnyAsync(x => x.MoveRequestId == draft.Id));
        }
        var published = await client.PostAsJsonAsync($"/api/v1/move-requests/{draft.Id}/publish", ConsentFixtures.Sharing);
        published.EnsureSuccessStatusCode();
        var result = (await published.Content.ReadFromJsonAsync<PublishMoveRequestResponse>(ApiJson.Options))!;
        await using var verify = fixture.CreateDbContext();
        var consent = await verify.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == draft.Id);
        Assert.Equal(result.MoveRequest.CurrentVersion!.Id, consent.RequestVersionId);
        Assert.Equal(result.MoveRequest.MaxLeadBuyers, consent.MaxRecipients);
        var persistedRequest = (await verify.MoveRequests.FindAsync(draft.Id))!;
        // PostgreSQL timestamps have microsecond precision; compare the two
        // stored records, not a pre-rounding .NET response timestamp.
        Assert.Equal(persistedRequest.PublishedAt, consent.AcceptedAt);
        Assert.Equal(MoveRequestStatus.Active, persistedRequest.Status);
        verify.ContactSharingAcceptances.Add(new ContactSharingAcceptance {
            Id = Guid.NewGuid(), UserId = user.Id, MoveRequestId = draft.Id, RequestVersionId = consent.RequestVersionId,
            DisclosureVersion = ConsentPolicy.Version, MaxRecipients = consent.MaxRecipients, AcceptedAt = DateTimeOffset.UtcNow, IsTestOnly = true,
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => verify.SaveChangesAsync());
    }

    [SkippableFact]
    public async Task FailedInitialVersionSaveRollsBackDraft()
    {
        RequireDatabase();
        using var app = CreateApp(new RejectInitialVersionSave());
        using var client = app.CreateClient();
        var response = await SignIn(client, Credential(), ConsentFixtures.Acceptance);
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        await Csrf(client);
        var create = await client.PostAsJsonAsync("/api/v1/move-requests", new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        Assert.Equal(HttpStatusCode.InternalServerError, create.StatusCode);
        await using var db = fixture.CreateDbContext();
        Assert.False(await db.MoveRequests.AnyAsync(x => x.CustomerUserId == user.Id));
        Assert.False(await db.MoveRequestVersions.AnyAsync(x => x.CreatedByUserId == user.Id));
    }

    private sealed class RejectInitialVersionSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<MoveRequestVersion>().Any(x => x.State == EntityState.Added))
                throw new InvalidOperationException("Deliberate failure to verify draft transaction rollback.");
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private WebApplicationFactory<Program> CreateApp(SaveChangesInterceptor? interceptor = null)
        => new WebApplicationFactory<Program>().WithWebHostBuilder(builder => {
            builder.UseEnvironment("Testing");
            builder.ConfigureTestServices(services => {
                services.RemoveAll<MovelyDbContext>();
                services.RemoveAll<DbContextOptions<MovelyDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<MovelyDbContext>>();
                services.AddDbContext<MovelyDbContext>(options => {
                    options.UseNpgsql(fixture.ConnectionString);
                    if (interceptor is not null) options.AddInterceptors(interceptor);
                });
            });
        });

    private sealed class RejectPolicySave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<PolicyAcceptance>().Any(x => x.State == EntityState.Added))
                throw new InvalidOperationException("Deliberate failure to verify transaction rollback.");
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING for PostgreSQL integration tests.");
    private static string Credential() => $"dev-google:{Guid.NewGuid():N}:{Guid.NewGuid():N}@example.com:Postgres:Test";
    private sealed record CsrfResponse(string RequestToken);
    private static async Task Csrf(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.RequestToken);
    }
    private static async Task<HttpResponseMessage> SignIn(HttpClient client, string credential, PolicyAcceptanceRequest? acceptance)
    {
        await Csrf(client);
        return await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest(credential, acceptance));
    }
}
