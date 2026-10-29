using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Modules.Identity;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class MoveRequestsContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string PrivateMarker = "owner-only-private-marker";
    private sealed record CsrfResponse(string RequestToken);

    [Fact]
    public async Task BrowserStringEnumsAreAcceptedAndReturnedIncludingNestedFields()
    {
        using var owner = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);

        using var response = await owner.GetAsync($"/api/v1/move-requests/{requestId}");
        response.EnsureSuccessStatusCode();
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var request = json.RootElement;
        Assert.Equal("ApartmentMove", request.GetProperty("requestType").GetString());
        Assert.Equal("Draft", request.GetProperty("status").GetString());
        Assert.Equal("Closed", request.GetProperty("leadSalesStatus").GetString());
        var version = request.GetProperty("currentVersion");
        Assert.Equal("ApartmentMove", version.GetProperty("requestType").GetString());
        Assert.Equal("From1000To1500", version.GetProperty("budgetBand").GetString());
        Assert.Equal("Yes", version.GetProperty("pickup").GetProperty("elevatorFurnitureSuitability").GetString());
        Assert.Equal("Morning", version.GetProperty("schedule").GetProperty("preferredTime").GetString());
        Assert.Equal("Exact", version.GetProperty("schedule").GetProperty("dateFlexibility").GetString());
        var inventory = version.GetProperty("apartmentMove").GetProperty("inventoryItems")[0];
        Assert.Equal("ApartmentInventory", inventory.GetProperty("kind").GetString());
        Assert.Equal("Sofa", inventory.GetProperty("apartmentInventoryType").GetString());

        using var me = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/auth/me"));
        Assert.Equal("Customer", me.RootElement.GetProperty("role").GetString());
    }

    [Fact]
    public async Task AnonymousDetailReadsReturn401ForExistingAndUnknownIds()
    {
        using var owner = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);
        using var anonymous = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        foreach (var id in new[] { requestId, Guid.NewGuid() })
        {
            using var response = await anonymous.GetAsync($"/api/v1/move-requests/{id}");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
            Assert.DoesNotContain(PrivateMarker, await response.Content.ReadAsStringAsync());
        }
    }

    [Theory]
    [InlineData(UserRole.Mover)]
    [InlineData(UserRole.Admin)]
    public async Task NonCustomerRoleCannotUseOwnerEndpointEvenForFormerlyOwnedRequest(UserRole role)
    {
        using var owner = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);
        var me = (await owner.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            (await db.Users.SingleAsync(x => x.Id == me.Id)).Role = role;
            await db.SaveChangesAsync();
        }
        using var response = await owner.GetAsync($"/api/v1/move-requests/{requestId}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.DoesNotContain(PrivateMarker, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownAndForeignIdsHaveTheSame404ContractWithoutPrivatePayload()
    {
        using var owner = await SignInAsync();
        using var other = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);
        string? errorMessage = null;
        foreach (var id in new[] { requestId, Guid.NewGuid() })
        {
            using var response = await other.GetAsync($"/api/v1/move-requests/{id}");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain(PrivateMarker, body);
            using var json = JsonDocument.Parse(body);
            Assert.Equal("MOVE_REQUEST_NOT_FOUND", json.RootElement.GetProperty("errorCode").GetString());
            Assert.False(json.RootElement.TryGetProperty("currentVersion", out _));
            Assert.False(json.RootElement.TryGetProperty("customerUserId", out _));
            var message = json.RootElement.GetProperty("message").GetString();
            errorMessage ??= message;
            Assert.Equal(errorMessage, message);
        }
    }

    [Theory]
    [InlineData(MoveRequestStatus.Closed)]
    [InlineData(MoveRequestStatus.Cancelled)]
    [InlineData(MoveRequestStatus.Expired)]
    public async Task TerminalRequestsRemainReadableOnlyByTheirOwner(MoveRequestStatus status)
    {
        using var owner = await SignInAsync();
        using var other = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var request = await db.MoveRequests.SingleAsync(x => x.Id == requestId);
            request.Status = status;
            request.LeadSalesStatus = LeadSalesStatus.Closed;
            await db.SaveChangesAsync();
        }
        using var allowed = await owner.GetAsync($"/api/v1/move-requests/{requestId}");
        allowed.EnsureSuccessStatusCode();
        var allowedBody = await allowed.Content.ReadAsStringAsync();
        Assert.Contains(PrivateMarker, allowedBody);
        using var json = JsonDocument.Parse(allowedBody);
        Assert.Equal(status.ToString(), json.RootElement.GetProperty("status").GetString());
        using var denied = await other.GetAsync($"/api/v1/move-requests/{requestId}");
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        Assert.DoesNotContain(PrivateMarker, await denied.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("revoked")]
    [InlineData("expired")]
    [InlineData("suspended")]
    public async Task DetailAccessStopsWhenExistingSessionBecomesInvalid(string reason)
    {
        using var owner = await SignInAsync();
        var requestId = await CreateRequestAsync(owner);
        var me = (await owner.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!;
        using var before = await owner.GetAsync($"/api/v1/move-requests/{requestId}");
        before.EnsureSuccessStatusCode();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var session = await db.UserSessions.SingleAsync(x => x.UserId == me.Id);
            if (reason == "revoked") session.RevokedAt = DateTimeOffset.UtcNow;
            else if (reason == "expired") session.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            else (await db.Users.SingleAsync(x => x.Id == me.Id)).Status = UserStatus.Suspended;
            await db.SaveChangesAsync();
        }
        using var after = await owner.GetAsync($"/api/v1/move-requests/{requestId}");
        Assert.Equal(HttpStatusCode.Unauthorized, after.StatusCode);
        Assert.DoesNotContain(PrivateMarker, await after.Content.ReadAsStringAsync());
    }

    private async Task<HttpClient> SignInAsync()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true, AllowAutoRedirect = false });
        await SetCsrfAsync(client);
        var subject = $"request-contract-{Guid.NewGuid():N}";
        using var response = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{subject}:{subject}@example.com:Request:Owner", ConsentFixtures.Acceptance));
        response.EnsureSuccessStatusCode();
        await SetCsrfAsync(client);
        return client;
    }

    private static async Task SetCsrfAsync(HttpClient client)
    {
        var csrf = (await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf"))!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.RequestToken);
    }

    private static async Task<Guid> CreateRequestAsync(HttpClient client)
    {
        // Literal JSON mirrors the browser; C# enum serialization must not hide a wire mismatch.
        using var create = await client.PostAsync("/api/v1/move-requests",
            new StringContent("""{"requestType":"ApartmentMove"}""", Encoding.UTF8, "application/json"));
        create.EnsureSuccessStatusCode();
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        Assert.Equal("ApartmentMove", created.RootElement.GetProperty("requestType").GetString());
        var id = created.RootElement.GetProperty("id").GetGuid();
        var body = new
        {
            requestType = "ApartmentMove",
            pickup = new { city = "Haifa", exactAddress = PrivateMarker, floor = 2, hasElevator = true, elevatorFurnitureSuitability = "Yes" },
            apartmentMove = new
            {
                numberOfRooms = 3,
                boxes = new { small = 1, medium = 2, large = 3 },
                inventoryItems = new[] { new { kind = "ApartmentInventory", apartmentInventoryType = "Sofa", name = PrivateMarker, quantity = 1 } },
                additionalServices = new { furnitureDisassembly = true, furnitureAssembly = false, packingAssistance = false, packingMaterials = false }
            },
            schedule = new { moveDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), preferredTime = "Morning", dateFlexibility = "Exact" },
            budgetBand = "From1000To1500",
            customerComment = PrivateMarker,
            photos = new[] { new { objectKey = $"private/{PrivateMarker}.jpg", originalFileName = $"{PrivateMarker}.jpg", contentType = "image/jpeg", sizeBytes = 1000L, displayOrder = 0 } }
        };
        using var update = await client.PutAsJsonAsync($"/api/v1/move-requests/{id}", body);
        update.EnsureSuccessStatusCode();
        return id;
    }
}
