using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Support;

namespace Movely.Api.Tests;

public sealed class SupportRequestEndpointTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    private readonly Dictionary<HttpClient, Guid> _actors = [];
    private readonly SupportTestOptions _flags = new(true);
    private readonly WebApplicationFactory<Program> _host;
    public SupportRequestEndpointTests() => _host = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddSingleton<IOptionsMonitor<SupportOptions>>(_flags)));
    public void Dispose() { _host.Dispose(); _factory.Dispose(); }

    [Fact]
    public async Task CapabilityDefaultsOffWithoutHidingExistingReads()
    {
        using var app = new ApiFactory();
        using var anonymous = app.CreateClient();
        using var response = await anonymous.GetAsync("/api/v1/support/capabilities");
        Assert.False((await response.Content.ReadFromJsonAsync<SupportCapabilitiesDto>())!.RequestsEnabled);
        Assert.True(response.Headers.CacheControl?.NoStore);
        var (owner, _) = await Session();
        using var client = owner;
        var ticket = await Create(client);
        _flags.CurrentValue.RequestsEnabled = false;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Path(ticket.Id))).StatusCode);
        using var disabled = await client.PostAsJsonAsync(Path(), SupportTestData.Create(Actor(client)), ApiJson.Options);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, disabled.StatusCode);
        Assert.Contains("SUPPORT_REQUESTS_DISABLED", await disabled.Content.ReadAsStringAsync());
        Assert.True(disabled.Headers.CacheControl?.NoStore);
        using var cancel = await client.PostAsJsonAsync(Path(ticket.Id) + "/cancel", new SupportCancelRequest(Guid.NewGuid(), ticket.RevisionId, Actor(client)), ApiJson.Options);
        cancel.EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData(UserRole.Customer, 201)]
    [InlineData(UserRole.Mover, 201)]
    [InlineData(UserRole.Admin, 403)]
    [InlineData(null, 401)]
    public async Task OnlyAuthenticatedCustomersAndMoversCanSubmitWithoutPhoneOrPolicy(UserRole? role, int expected)
    {
        using var client = role is null ? _host.CreateClient() : (await Session(role.Value)).Client;
        using var response = await client.PostAsJsonAsync(Path(), SupportTestData.Create(Actor(client), SupportRequestType.PrivacyAccess), ApiJson.Options);
        Assert.Equal(expected, (int)response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task MutationRequiresCsrfAndOwnerScopeIncludesSubmissionLookup()
    {
        var (owner, _) = await Session();
        using var client = owner;
        var command = SupportTestData.Create(Actor(client));
        using var created = await client.PostAsJsonAsync(Path(), command, ApiJson.Options);
        var ticket = (await created.Content.ReadFromJsonAsync<CreateSupportResponse>(ApiJson.Options))!.Request;
        var (other, _) = await Session();
        using var otherClient = other;
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Path(ticket.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Path() + $"/by-client-mutation/{command.ClientMutationId}")).StatusCode);
        using var deniedReply = await other.PostAsJsonAsync(Path(ticket.Id) + "/replies", new SupportReplyRequest(Guid.NewGuid(), ticket.RevisionId, "Unrelated account", Actor(other)), ApiJson.Options);
        Assert.Equal(HttpStatusCode.NotFound, deniedReply.StatusCode);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        using var csrf = await client.PostAsJsonAsync(Path(ticket.Id) + "/cancel", new SupportCancelRequest(Guid.NewGuid(), ticket.RevisionId, Actor(client)), ApiJson.Options);
        Assert.Equal(HttpStatusCode.BadRequest, csrf.StatusCode);
        using var scope = _host.Services.CreateScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().SupportRequestEvents.CountAsync());
    }

    [Fact]
    public async Task AdminRepliesExposeOnlyAssociatedOwnerAndPlainVisibleHistoryWithoutActorIdentities()
    {
        var (owner, ownerId) = await Session();
        using var client = owner;
        var ticket = await Create(client, SupportRequestType.PrivacyDeletion);
        var (admin, adminId) = await Session(UserRole.Admin);
        using var staff = admin;
        using var response = await admin.PostAsJsonAsync(AdminPath(ticket.Id) + "/replies",
            new AdminSupportReplyRequest(Guid.NewGuid(), ticket.RevisionId, "Request reviewed. No automatic deletion occurs.", SupportRequestStatus.Resolved, adminId), ApiJson.Options);
        response.EnsureSuccessStatusCode();
        var result = (await response.Content.ReadFromJsonAsync<AdminSupportCommandResponse>(ApiJson.Options))!;
        Assert.Equal(ownerId, result.Request.Owner.Id);
        Assert.Equal(SupportRequestStatus.Resolved, result.Request.Status);
        using var read = await client.GetAsync(Path(ticket.Id));
        Assert.True(read.Headers.CacheControl?.NoStore);
        var json = await read.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        Assert.Equal(new[] { "clientMutationId", "createdAt", "history", "id", "revisionId", "status", "subject", "type", "updatedAt" }, document.RootElement.EnumerateObject().Select(x => x.Name).Order());
        var entry = document.RootElement.GetProperty("history").GetProperty("items")[0];
        Assert.Equal(new[] { "actor", "body", "clientMutationId", "createdAt", "id", "kind", "previousStatus", "revisionId", "sequenceNumber", "status" }, entry.EnumerateObject().Select(x => x.Name).Order());
        Assert.DoesNotContain(adminId.ToString(), json);
        Assert.DoesNotContain(ownerId.ToString(), json);
        Assert.DoesNotContain("actorUserId", json);
        Assert.DoesNotContain("phone", json);
        Assert.DoesNotContain("email", json);
        Assert.Contains("No automatic deletion occurs", json);
        using var deniedAdmin = await client.GetAsync(AdminPath(ticket.Id));
        Assert.Equal(HttpStatusCode.Forbidden, deniedAdmin.StatusCode);
        using var scope = _host.Services.CreateScope();
        Assert.NotNull(await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().Users.FindAsync(ownerId));
    }

    [Fact]
    public async Task IdempotentHttpReceiptsSurviveDisabledModeAndChangedRevisions()
    {
        var (owner, _) = await Session();
        using var client = owner;
        var command = SupportTestData.Create(Actor(client));
        using var firstResponse = await client.PostAsJsonAsync(Path(), command, ApiJson.Options);
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        var first = (await firstResponse.Content.ReadFromJsonAsync<CreateSupportResponse>(ApiJson.Options))!;
        var reply = new SupportReplyRequest(Guid.NewGuid(), first.Request.RevisionId, "Additional information", Actor(client));
        using var replyResponse = await client.PostAsJsonAsync(Path(first.Request.Id) + "/replies", reply, ApiJson.Options);
        var applied = (await replyResponse.Content.ReadFromJsonAsync<SupportCommandResponse>(ApiJson.Options))!;
        _flags.CurrentValue.RequestsEnabled = false;
        using var repeatedCreate = await client.PostAsJsonAsync(Path(), command, ApiJson.Options);
        Assert.Equal(HttpStatusCode.OK, repeatedCreate.StatusCode);
        Assert.True((await repeatedCreate.Content.ReadFromJsonAsync<CreateSupportResponse>(ApiJson.Options))!.AlreadyCreated);
        using var repeatedReply = await client.PostAsJsonAsync(Path(first.Request.Id) + "/replies", reply, ApiJson.Options);
        repeatedReply.EnsureSuccessStatusCode();
        var repeated = (await repeatedReply.Content.ReadFromJsonAsync<SupportCommandResponse>(ApiJson.Options))!;
        Assert.True(repeated.AlreadyApplied);
        Assert.Equal(applied.EventId, repeated.EventId);
        Assert.Equal(applied.Request.RevisionId, repeated.Request.RevisionId);
        var found = (await client.GetFromJsonAsync<SupportRequestDetailDto>(Path() + $"/by-client-mutation/{command.ClientMutationId}", ApiJson.Options))!;
        Assert.Equal(first.Request.Id, found.Id);
        using var changed = await client.PostAsJsonAsync(Path(first.Request.Id) + "/replies", reply with { Body = "Different content" }, ApiJson.Options);
        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Contains("SUPPORT_IDEMPOTENCY_CONFLICT", await changed.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=51")]
    [InlineData("?type=2")]
    [InlineData("?status=Deleted")]
    [InlineData("?page=2147483647&pageSize=50")]
    [InlineData("?status=Open&status=Resolved")]
    public async Task InvalidFiltersAndHistoryBoundsReturn400(string query)
    {
        var (owner, _) = await Session();
        using var client = owner;
        using var response = await client.GetAsync(Path() + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("INVALID_SUPPORT_QUERY", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task OversizedStreamIsRejectedBeforeParsingWithOrWithoutContentLength(bool chunked)
    {
        var (owner, _) = await Session();
        using var client = owner;
        var text = JsonSerializer.Serialize(new { clientMutationId = Guid.NewGuid(), type = "General", subject = "Subject", message = new string('a', 33000) });
        using HttpContent content = chunked ? new ChunkedContent(text) : new StringContent(text, Encoding.UTF8, "application/json");
        using var response = await client.PostAsync(Path(), content);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Contains("SUPPORT_PAYLOAD_TOO_LARGE", await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl?.NoStore);
        using var scope = _host.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().SupportRequests.ToListAsync());
    }

    [Theory]
    [InlineData("create", 5)]
    [InlineData("read", 60)]
    [InlineData("command", 10)]
    [InlineData("admin", 30)]
    public async Task RateBudgetsAreBoundToAuthenticatedAccountAndIndependentOfReads(string operation, int limit)
    {
        var (owner, _) = await Session();
        using var ownerClient = owner;
        var ticket = await Create(owner);
        var (staff, _) = await Session(UserRole.Admin);
        using var adminClient = staff;
        var caller = operation == "admin" ? staff : owner;
        var creation = SupportTestData.Create(Actor(owner));
        var mutation = Guid.NewGuid();
        async Task<HttpResponseMessage> Send(HttpClient client) => operation switch {
            "read" => await client.GetAsync(Path()),
            "create" => await client.PostAsJsonAsync(Path(), creation with { ExpectedActorUserId = Actor(client) }, ApiJson.Options),
            "admin" => await client.PostAsJsonAsync(AdminPath(ticket.Id) + "/replies", new AdminSupportReplyRequest(mutation, ticket.RevisionId, "Visible reply", SupportRequestStatus.InReview, Actor(client)), ApiJson.Options),
            _ => await client.PostAsJsonAsync(Path(ticket.Id) + "/replies", new SupportReplyRequest(mutation, ticket.RevisionId, "Owner reply", Actor(client)), ApiJson.Options),
        };
        // Setup consumed one owner creation permit.
        var available = operation == "create" ? limit - 1 : limit;
        for (var i = 0; i < available; i++) { using var response = await Send(caller); response.EnsureSuccessStatusCode(); }
        using var blocked = await Send(caller);
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.NotNull(blocked.Headers.RetryAfter);
        Assert.True(blocked.Headers.CacheControl?.NoStore);
        using var independent = operation == "read"
            ? await caller.PostAsJsonAsync(Path(), SupportTestData.Create(Actor(caller)), ApiJson.Options)
            : await caller.GetAsync(operation == "admin" ? AdminPath() : Path());
        independent.EnsureSuccessStatusCode();
        var (other, _) = await Session(operation == "admin" ? UserRole.Admin : UserRole.Customer);
        using var otherClient = other;
        using var separate = await Send(other);
        Assert.NotEqual(HttpStatusCode.TooManyRequests, separate.StatusCode);
    }

    [Theory]
    [InlineData("create")]
    [InlineData("reply")]
    [InlineData("cancel")]
    [InlineData("admin-reply")]
    [InlineData("admin-status")]
    public async Task FrozenIntentCannotBeExecutedUnderAnotherSignedInAccount(string operation)
    {
        var (owner, ownerId) = await Session();
        using var ownerClient = owner;
        var ticket = await Create(owner);
        var adminAction = operation.StartsWith("admin-", StringComparison.Ordinal);
        var (other, _) = await Session(adminAction ? UserRole.Admin : UserRole.Customer);
        using var otherClient = other;
        using var response = operation switch {
            "create" => await other.PostAsJsonAsync(Path(), SupportTestData.Create(ownerId), ApiJson.Options),
            "reply" => await other.PostAsJsonAsync(Path(ticket.Id) + "/replies", new SupportReplyRequest(Guid.NewGuid(), ticket.RevisionId, "Frozen private message", ownerId), ApiJson.Options),
            "cancel" => await other.PostAsJsonAsync(Path(ticket.Id) + "/cancel", new SupportCancelRequest(Guid.NewGuid(), ticket.RevisionId, ownerId), ApiJson.Options),
            "admin-reply" => await other.PostAsJsonAsync(AdminPath(ticket.Id) + "/replies", new AdminSupportReplyRequest(Guid.NewGuid(), ticket.RevisionId, "Frozen staff response", SupportRequestStatus.Resolved, ownerId), ApiJson.Options),
            _ => await other.PostAsJsonAsync(AdminPath(ticket.Id) + "/status", new AdminSupportStatusRequest(Guid.NewGuid(), ticket.RevisionId, SupportRequestStatus.InReview, ownerId), ApiJson.Options),
        };
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("SUPPORT_ACCOUNT_CHANGED", json);
        Assert.DoesNotContain("Frozen", json);
        Assert.DoesNotContain("already", json);
        using var scope = _host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Single(await db.SupportRequests.ToListAsync());
        Assert.Single(await db.SupportRequestEvents.ToListAsync());
        Assert.Equal(ticket.RevisionId, (await db.SupportRequests.FindAsync(ticket.Id))!.RevisionId);
    }

    [Fact]
    public async Task MissingExpectedActorIsRejectedAndClientCannotInjectStatusOwnerOrHistory()
    {
        var (owner, ownerId) = await Session();
        using var client = owner;
        using var missing = await client.PostAsJsonAsync(Path(), new { clientMutationId = Guid.NewGuid(), type = "General", subject = "Subject", message = "Message" });
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        Assert.Contains("SUPPORT_ACCOUNT_CHANGED", await missing.Content.ReadAsStringAsync());
        using var injected = await client.PostAsJsonAsync(Path(), new {
            clientMutationId = Guid.NewGuid(), expectedActorUserId = ownerId, type = "General", subject = "Subject", message = "Message",
            ownerUserId = Guid.NewGuid(), status = "Resolved", revisionId = Guid.NewGuid(), history = new[] { new { actor = "Support", body = "Injected" } },
        });
        injected.EnsureSuccessStatusCode();
        var receipt = (await injected.Content.ReadFromJsonAsync<CreateSupportResponse>(ApiJson.Options))!;
        Assert.Equal(SupportRequestStatus.Open, receipt.Request.Status);
        Assert.Equal(SupportEventActor.Owner, Assert.Single(receipt.Request.History.Items).Actor);
        Assert.DoesNotContain("Injected", await injected.Content.ReadAsStringAsync());
        using var scope = _host.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().SupportRequests.SingleAsync();
        Assert.Equal(ownerId, stored.OwnerUserId);
    }

    private async Task<SupportRequestDetailDto> Create(HttpClient client, SupportRequestType type = SupportRequestType.General)
    {
        using var response = await client.PostAsJsonAsync(Path(), SupportTestData.Create(Actor(client), type), ApiJson.Options);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateSupportResponse>(ApiJson.Options))!.Request;
    }
    private async Task<(HttpClient Client, Guid UserId)> Session(UserRole role = UserRole.Customer)
    {
        using var scope = _host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var user = await BusinessTestData.User(db, role, phone: false, consent: false);
        var token = await scope.ServiceProvider.GetRequiredService<ISessionService>().CreateSessionAsync(user.Id);
        var client = _host.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}");
        using var csrf = await client.GetAsync("/api/v1/auth/csrf");
        csrf.EnsureSuccessStatusCode();
        var cookie = csrf.Headers.GetValues("Set-Cookie").Select(x => x.Split(';')[0]).Single(x => x.StartsWith("movely.csrf=", StringComparison.Ordinal));
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}; {cookie}");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", (await csrf.Content.ReadFromJsonAsync<CsrfReply>())!.RequestToken);
        _actors.Add(client, user.Id);
        return (client, user.Id);
    }
    private Guid Actor(HttpClient client) => _actors.GetValueOrDefault(client, Guid.NewGuid());
    private static string Path(Guid? id = null) => "/api/v1/support/requests" + (id.HasValue ? $"/{id}" : "");
    private static string AdminPath(Guid? id = null) => "/api/v1/admin/support/requests" + (id.HasValue ? $"/{id}" : "");
    private sealed record CsrfReply(string RequestToken);
    private sealed class ChunkedContent(string text) : HttpContent
    {
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => stream.WriteAsync(Encoding.UTF8.GetBytes(text), 0, Encoding.UTF8.GetByteCount(text));
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
    }
}
