using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlIdentityPersistenceTests : IClassFixture<PostgreSqlIntegrationFixture>
{
    private readonly PostgreSqlIntegrationFixture _fixture;

    public PostgreSqlIdentityPersistenceTests(PostgreSqlIntegrationFixture fixture)
    {
        _fixture = fixture;
    }

    [SkippableFact]
    public async Task Phase2Migrations_ApplySuccessfully_FromCleanPostgreSqlDatabase()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);

        await using var db = _fixture.CreateDbContext();
        var migrations = await db.Database.GetAppliedMigrationsAsync();

        Assert.Contains(migrations, migration => migration.EndsWith("_Phase2IdentityFoundation", StringComparison.Ordinal));
    }

    [SkippableFact]
    public async Task Phase3Migrations_ApplySuccessfully_FromCleanPostgreSqlDatabase()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);

        await using var db = _fixture.CreateDbContext();
        var migrations = await db.Database.GetAppliedMigrationsAsync();

        Assert.Contains(migrations, migration => migration.EndsWith("_Phase3MoveRequestDomainFoundation", StringComparison.Ordinal));
    }

    [SkippableFact]
    public async Task DuplicateProviderAndSubject_ViolatesUniqueConstraint()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        await using var db = _fixture.CreateDbContext();
        var user = CreateUser();
        db.Users.Add(user);
        db.UserAuthIdentities.Add(CreateGoogleIdentity(user.Id, "same-subject"));
        db.UserAuthIdentities.Add(CreateGoogleIdentity(user.Id, "same-subject"));

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [SkippableFact]
    public async Task AuthIdentity_RequiresExistingUser()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        await using var db = _fixture.CreateDbContext();
        db.UserAuthIdentities.Add(CreateGoogleIdentity(Guid.NewGuid(), "missing-user"));

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [SkippableFact]
    public async Task BusinessStatus_PersistsAcrossDbContextInstances()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        var user = CreateUser(role: UserRole.Mover);
        var businessId = Guid.NewGuid();

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(user);
            db.Businesses.Add(new Business
            {
                Id = businessId,
                OwnerUserId = user.Id,
                Name = "Movely Movers",
                Status = BusinessStatus.Verified,
                CreatedAt = Now,
                UpdatedAt = Now
            });
            await db.SaveChangesAsync();
        }

        await using (var db = _fixture.CreateDbContext())
        {
            var business = await db.Businesses.SingleAsync(x => x.Id == businessId);
            Assert.Equal(BusinessStatus.Verified, business.Status);
        }
    }

    [SkippableFact]
    public async Task PhoneVerified_PersistsAcrossDbContextInstances()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        var user = CreateUser(phoneVerified: true);

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }

        await using (var db = _fixture.CreateDbContext())
        {
            var savedUser = await db.Users.SingleAsync(x => x.Id == user.Id);
            Assert.True(savedUser.PhoneVerified);
        }
    }

    [SkippableFact]
    public async Task OtpChallenge_PersistsHashedState()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        var user = CreateUser();
        var hasher = new OtpCodeHasher();
        var code = hasher.GenerateCode();
        var (salt, hash) = hasher.Hash(code);
        var challengeId = Guid.NewGuid();

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(user);
            db.PhoneVerifications.Add(new PhoneVerification
            {
                Id = challengeId,
                UserId = user.Id,
                NormalizedPhone = "+972501111111",
                Purpose = PhoneVerificationPurpose.CustomerPublishVerification,
                CodeSalt = salt,
                CodeHash = hash,
                AttemptCount = 0,
                MaxAttempts = 5,
                ResendAvailableAt = Now.AddSeconds(60),
                ExpiresAt = Now.AddMinutes(10),
                CreatedAt = Now,
                UpdatedAt = Now
            });
            await db.SaveChangesAsync();
        }

        await using (var db = _fixture.CreateDbContext())
        {
            var savedChallenge = await db.PhoneVerifications.SingleAsync(x => x.Id == challengeId);
            Assert.NotEqual(code, savedChallenge.CodeHash);
            Assert.NotEqual(code, savedChallenge.CodeSalt);
            Assert.True(hasher.Verify(code, savedChallenge.CodeSalt, savedChallenge.CodeHash));
        }
    }

    [SkippableFact]
    public async Task OtpSingleUseState_Persists()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        var user = CreateUser();
        var challengeId = Guid.NewGuid();

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(user);
            db.PhoneVerifications.Add(new PhoneVerification
            {
                Id = challengeId,
                UserId = user.Id,
                NormalizedPhone = "+972502222222",
                Purpose = PhoneVerificationPurpose.CustomerPublishVerification,
                CodeSalt = "salt",
                CodeHash = "hash",
                AttemptCount = 1,
                MaxAttempts = 5,
                ResendAvailableAt = Now.AddSeconds(60),
                ExpiresAt = Now.AddMinutes(10),
                VerifiedAt = Now,
                ConsumedAt = Now,
                CreatedAt = Now,
                UpdatedAt = Now
            });
            await db.SaveChangesAsync();
        }

        await using (var db = _fixture.CreateDbContext())
        {
            var savedChallenge = await db.PhoneVerifications.SingleAsync(x => x.Id == challengeId);
            Assert.NotNull(savedChallenge.ConsumedAt);
        }
    }

    [SkippableFact]
    public async Task DatabaseBackedSession_PersistsAndCanBeResolved()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        var user = CreateUser();

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }

        string token;
        await using (var db = _fixture.CreateDbContext())
        {
            var sessionService = new SessionService(db, new SystemClock());
            token = await sessionService.CreateSessionAsync(user.Id);
        }

        await using (var db = _fixture.CreateDbContext())
        {
            var tokenHash = SecurityTokenHasher.HashToken(token);
            var session = await db.UserSessions.SingleAsync(x => x.SessionTokenHash == tokenHash);
            Assert.Equal(user.Id, session.UserId);
            Assert.Null(session.RevokedAt);
        }
    }

    [SkippableFact]
    public async Task DuplicatePhoneNumbers_AreAllowedByCurrentApprovedModel()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        await using var db = _fixture.CreateDbContext();
        db.Users.Add(CreateUser(email: "phone-a@example.com", phone: "+972503333333"));
        db.Users.Add(CreateUser(email: "phone-b@example.com", phone: "+972503333333"));

        await db.SaveChangesAsync();

        Assert.Equal(2, await db.Users.CountAsync(x => x.Phone == "+972503333333"));
    }

    [SkippableFact]
    public async Task ResetDatabase_CleansRowsBetweenPostgreSqlIntegrationTests()
    {
        Skip.IfNot(_fixture.IsConfigured, MissingPostgresReason);
        await _fixture.ResetAsync();

        await using (var db = _fixture.CreateDbContext())
        {
            db.Users.Add(CreateUser());
            await db.SaveChangesAsync();
        }

        await _fixture.ResetAsync();

        await using (var db = _fixture.CreateDbContext())
        {
            Assert.Equal(0, await db.Users.CountAsync());
        }
    }

    private static UserAuthIdentity CreateGoogleIdentity(Guid userId, string subject)
        => new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Provider = AuthProvider.Google,
            ProviderSubject = subject,
            CreatedAt = Now
        };

    private static MovelyUser CreateUser(
        UserRole role = UserRole.Customer,
        bool phoneVerified = false,
        string? email = null,
        string? phone = null)
        => new()
        {
            Id = Guid.NewGuid(),
            FirstName = "Phase",
            LastName = "Two",
            Email = email ?? $"{Guid.NewGuid():N}@example.com",
            Phone = phone,
            PhoneVerified = phoneVerified,
            Role = role,
            Status = UserStatus.Active,
            CreatedAt = Now,
            UpdatedAt = Now
        };

    private static DateTimeOffset Now => DateTimeOffset.UtcNow;

    private const string MissingPostgresReason =
        "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING to run PostgreSQL integration tests.";
}
