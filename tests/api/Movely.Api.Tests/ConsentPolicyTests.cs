using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;

namespace Movely.Api.Tests;

public sealed class ConsentPolicyTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task MissingChoiceCannotCreateAccount(bool adult, bool terms)
    {
        var credential = Credential();
        using var client = factory.CreateClient();
        var result = await SignIn(client, credential, ConsentFixtures.Acceptance with { AdultConfirmed = adult, AcceptTerms = terms });
        Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode);
        Assert.Contains("POLICY_ACCEPTANCE_REQUIRED", await result.Content.ReadAsStringAsync());
        await AssertNoIdentity(credential);
    }

    [Fact]
    public async Task MissingOrOutdatedConsentCreatesNeitherAccountNorSession()
    {
        using var client = factory.CreateClient();
        var credential = Credential();
        var missing = await SignIn(client, credential, null);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        var outdated = await SignIn(client, credential, ConsentFixtures.Acceptance with { TermsVersion = "old" });
        Assert.Equal(HttpStatusCode.Conflict, outdated.StatusCode);
        Assert.Contains("POLICY_VERSION_CHANGED", await outdated.Content.ReadAsStringAsync());
        await AssertNoIdentity(credential);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task AcceptanceIsVersionedAndLoginDoesNotRewriteHistory()
    {
        using var client = factory.CreateClient();
        var credential = Credential();
        var response = await SignIn(client, credential, ConsentFixtures.Acceptance);
        response.EnsureSuccessStatusCode();
        var user = (await response.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        Assert.True(user.HasCurrentPolicyAcceptance);
        PolicyAcceptance first;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            first = await db.PolicyAcceptances.SingleAsync(x => x.UserId == user.Id);
            Assert.Equal(ConsentPolicy.Version, first.TermsVersion);
            Assert.Equal(ConsentPolicy.Version, first.PrivacyVersion);
            Assert.True(first.AdultConfirmed);
            Assert.True(first.IsTestOnly);
            Assert.InRange(first.AcceptedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow);
        }
        (await SignIn(client, credential, null)).EnsureSuccessStatusCode();
        using var check = factory.Services.CreateScope();
        var entries = await check.ServiceProvider.GetRequiredService<MovelyDbContext>().PolicyAcceptances.Where(x => x.UserId == user.Id).ToListAsync();
        Assert.Single(entries);
        Assert.Equal(first.Id, entries[0].Id);
        Assert.Equal(first.AcceptedAt, entries[0].AcceptedAt);
    }

    [Fact]
    public async Task RenewalPreservesOldAcceptanceAndRequiresExplicitChoices()
    {
        using var client = factory.CreateClient();
        var signedIn = await SignIn(client, Credential(), ConsentFixtures.Acceptance);
        var user = (await signedIn.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        Guid oldId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var old = await db.PolicyAcceptances.SingleAsync(x => x.UserId == user.Id);
            old.TermsVersion = "previous-version"; // Simulate an earlier document in a persisted database.
            oldId = old.Id;
            await db.SaveChangesAsync();
        }
        Assert.False((await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!.HasCurrentPolicyAcceptance);
        await Csrf(client);
        var invalid = await client.PostAsJsonAsync("/api/v1/auth/consents", ConsentFixtures.Acceptance with { AdultConfirmed = false });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var accepted = await client.PostAsJsonAsync("/api/v1/auth/consents", ConsentFixtures.Acceptance);
        Assert.Equal(HttpStatusCode.NoContent, accepted.StatusCode);
        Assert.True((await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!.HasCurrentPolicyAcceptance);
        using var check = factory.Services.CreateScope();
        var entries = await check.ServiceProvider.GetRequiredService<MovelyDbContext>().PolicyAcceptances.Where(x => x.UserId == user.Id).ToListAsync();
        Assert.Equal(2, entries.Count);
        Assert.Equal("previous-version", entries.Single(x => x.Id == oldId).TermsVersion);
    }

    [Fact]
    public async Task ProductionCannotAcceptDraftPolicies()
    {
        using var production = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var client = production.CreateClient();
        var response = await SignIn(client, Credential(), ConsentFixtures.Acceptance);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("LEGAL_NOT_READY", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public void BrowserAndServerReferenceTheSamePolicyVersion()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "apps", "web"))) root = root.Parent;
        Assert.NotNull(root);
        var source = File.ReadAllText(Path.Combine(root!.FullName, "apps", "web", "src", "lib", "legal-content.ts"));
        Assert.Contains($"LEGAL_DRAFT_VERSION = \"{ConsentPolicy.Version}\"", source);
    }

    private async Task AssertNoIdentity(string credential)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.False(await db.UserAuthIdentities.AnyAsync(x => x.ProviderSubject == credential.Split(':')[1]));
        Assert.False(await db.Users.AnyAsync(x => x.Email == credential.Split(':')[2]));
    }
    private sealed record CsrfResponse(string RequestToken);
    private static string Credential() => $"dev-google:{Guid.NewGuid():N}:{Guid.NewGuid():N}@example.com:Consent:Test";
    private static async Task Csrf(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
    }
    private static async Task<HttpResponseMessage> SignIn(HttpClient client, string credential, PolicyAcceptanceRequest? acceptance)
    {
        await Csrf(client);
        return await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest(credential, acceptance));
    }
}
