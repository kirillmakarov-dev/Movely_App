using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Localities;
using Npgsql;
using NpgsqlTypes;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlCanonicalLocalityTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    private const string PreviousMigration = "20261029163209_BindContactSharingToRequestVersions";

    [SkippableFact]
    public async Task PinnedBackfillCoversEveryOfficialNameAndAliasWithoutChangingPrivateText()
    {
        Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING to verify the PostgreSQL locality migration.");
        await fixture.ResetAsync();
        await using var db = fixture.CreateDbContext();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(PreviousMigration);
        try
        {
            var catalog = new LocalityCatalog();
            var rows = await SeedLegacyRows(db, catalog);
            await migrator.MigrateAsync();
            db.ChangeTracker.Clear();
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), name => name.EndsWith("_AddCanonicalLocalityCodes"));
            var saved = await db.MoveLocations.AsNoTracking().ToDictionaryAsync(location => location.Id);
            Assert.Equal(rows.Count, saved.Count);
            foreach (var row in rows)
            {
                Assert.Equal(row.City, saved[row.Id].City);
                Assert.Equal(row.ExpectedCode, saved[row.Id].CanonicalLocalityCode);
            }
            Assert.True(saved.Values.Count(location => location.CanonicalLocalityCode is not null) >= 1316);

            // Execute the canonical city + date + budget join on PostgreSQL, not EF InMemory.
            var expectedHaifa = rows.Count(row => row.ExpectedCode == "4000");
            var matching = await db.MoveLocations.AsNoTracking()
                .Where(location => location.CanonicalLocalityCode == "4000" && location.LocationType == MoveLocationType.Pickup
                    && location.MoveRequestVersion!.MoveDate >= DateOnly.FromDateTime(DateTime.UtcNow)
                    && location.MoveRequestVersion.BudgetBand == MoveBudgetBand.UpTo1000)
                .OrderBy(location => location.MoveRequestVersion!.MoveDate).ThenBy(location => location.MoveRequestVersionId)
                .Select(location => location.Id).ToListAsync();
            Assert.Equal(expectedHaifa, matching.Count);
            await AssertIndexes(db);

            // Rollback removes the derived projection/indexes, never private source data.
            await migrator.MigrateAsync(PreviousMigration);
            var legacyCities = await ReadLegacyCities(db);
            Assert.Equal(rows.Count, legacyCities.Count);
            foreach (var row in rows) Assert.Equal(row.City, legacyCities[row.Id]);
            await migrator.MigrateAsync();
            var reapplied = await db.MoveLocations.AsNoTracking().ToDictionaryAsync(location => location.Id, location => location.CanonicalLocalityCode);
            foreach (var row in rows) Assert.Equal(row.ExpectedCode, reapplied[row.Id]);
            Assert.False(db.Database.HasPendingModelChanges());
        }
        finally
        {
            await migrator.MigrateAsync();
        }
    }

    private static async Task<List<LegacyRow>> SeedLegacyRows(MovelyDbContext db, LocalityCatalog catalog)
    {
        var cities = new List<string?>();
        using (var stream = typeof(LocalityCatalog).Assembly.GetManifestResourceStream("Movely.Localities.localities.piba.2026-10-25.json"))
        {
            Assert.NotNull(stream);
            using var data = JsonDocument.Parse(stream);
            foreach (var locality in data.RootElement.EnumerateArray())
            {
                cities.Add(locality.GetProperty("name").GetString());
                cities.AddRange(locality.GetProperty("aliases").EnumerateArray().Select(alias => alias.GetString()));
            }
        }
        cities.AddRange([
            null, "  hAiFa  ", "Tel\tAviv\n- Yafo", "תל" + (char)0x00A0 + "אביב - יפו",
            "Haifa" + (char)0x0085, "חיפה" + (char)0x202E, "Haifa" + (char)1,
            "Haifa" + (char)0x001F, "4000", "תל אביב", "חיפה 0501234567", "Haifa, private street 1",
            "<script>Haifa</script>", "unknown@example.com", "not-a-place", "' OR TRUE --",
        ]);
        var user = new MovelyUser { Id = Guid.NewGuid(), FirstName = "Migration", LastName = "Fixture", Role = UserRole.Customer };
        db.Users.Add(user);
        var request = new MoveRequest { Id = Guid.NewGuid(), CustomerUserId = user.Id, Status = MoveRequestStatus.Draft };
        db.MoveRequests.Add(request);
        await db.SaveChangesAsync();
        var rows = cities.Select((city, index) => new LegacyRow(Guid.NewGuid(), Guid.NewGuid(), city, catalog.ResolveName(city)?.Code, index + 1)).ToList();
        db.MoveRequestVersions.AddRange(rows.Select(row => new MoveRequestVersion {
            Id = row.VersionId, MoveRequestId = request.Id, CreatedByUserId = user.Id, VersionNumber = row.VersionNumber,
            MoveDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), BudgetBand = MoveBudgetBand.UpTo1000,
        }));
        await db.SaveChangesAsync();
        await db.Database.OpenConnectionAsync();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await using (var writer = await connection.BeginBinaryImportAsync("""
            COPY "MoveLocations" ("Id", "MoveRequestVersionId", "LocationType", "City", "ElevatorFurnitureSuitability") FROM STDIN (FORMAT BINARY)
            """))
        {
            foreach (var row in rows)
            {
                await writer.StartRowAsync();
                await writer.WriteAsync(row.Id, NpgsqlDbType.Uuid);
                await writer.WriteAsync(row.VersionId, NpgsqlDbType.Uuid);
                await writer.WriteAsync("Pickup", NpgsqlDbType.Text);
                if (row.City is null) await writer.WriteNullAsync();
                else await writer.WriteAsync(row.City, NpgsqlDbType.Text);
                await writer.WriteAsync("Unknown", NpgsqlDbType.Text);
            }
            await writer.CompleteAsync();
        }
        return rows;
    }

    private static async Task<Dictionary<Guid, string?>> ReadLegacyCities(MovelyDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        await using var command = ((NpgsqlConnection)db.Database.GetDbConnection()).CreateCommand();
        command.CommandText = "SELECT \"Id\", \"City\" FROM \"MoveLocations\"";
        await using var reader = await command.ExecuteReaderAsync();
        var result = new Dictionary<Guid, string?>();
        while (await reader.ReadAsync()) result.Add(reader.GetGuid(0), reader.IsDBNull(1) ? null : reader.GetString(1));
        return result;
    }

    private static async Task AssertIndexes(MovelyDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        await using var command = ((NpgsqlConnection)db.Database.GetDbConnection()).CreateCommand();
        command.CommandText = "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()";
        await using var reader = await command.ExecuteReaderAsync();
        var definitions = new List<string>();
        while (await reader.ReadAsync()) definitions.Add(reader.GetString(0));
        Assert.Contains(definitions, value => value.Contains("(\"CanonicalLocalityCode\", \"LocationType\", \"MoveRequestVersionId\")"));
        Assert.Contains(definitions, value => value.Contains("(\"MoveDate\", \"Id\")"));
        Assert.Contains(definitions, value => value.Contains("(\"BudgetBand\", \"MoveDate\", \"Id\")"));
        Assert.Contains(definitions, value => value.Contains("(\"Status\", \"PublishedAt\" DESC, \"Id\")"));
    }

    private sealed record LegacyRow(Guid Id, Guid VersionId, string? City, string? ExpectedCode, int VersionNumber);
}
