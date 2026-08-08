using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Npgsql;

namespace Movely.Api.Tests;

public sealed class PostgreSqlIntegrationFixture : IAsyncLifetime
{
    private const string ConnectionStringEnvironmentVariable = "MOVELY_TEST_POSTGRES_CONNECTION_STRING";
    private readonly string _databaseName = $"movely_phase21_tests_{Guid.NewGuid():N}";
    private string? _adminConnectionString;

    public string? ConnectionString { get; private set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ConnectionStringEnvironmentVariable));

    public async Task InitializeAsync()
    {
        var configuredConnectionString = Environment.GetEnvironmentVariable(ConnectionStringEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(configuredConnectionString))
        {
            return;
        }

        var adminBuilder = new NpgsqlConnectionStringBuilder(configuredConnectionString)
        {
            Database = "postgres"
        };

        var testBuilder = new NpgsqlConnectionStringBuilder(configuredConnectionString)
        {
            Database = _databaseName
        };

        _adminConnectionString = adminBuilder.ConnectionString;
        ConnectionString = testBuilder.ConnectionString;

        await using var adminConnection = new NpgsqlConnection(_adminConnectionString);
        await adminConnection.OpenAsync();

        await using (var createCommand = adminConnection.CreateCommand())
        {
            createCommand.CommandText = $"CREATE DATABASE {QuoteIdentifier(_databaseName)}";
            await createCommand.ExecuteNonQueryAsync();
        }

        await using var db = CreateDbContext();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        if (string.IsNullOrWhiteSpace(_adminConnectionString))
        {
            return;
        }

        await using var adminConnection = new NpgsqlConnection(_adminConnectionString);
        await adminConnection.OpenAsync();

        await using var dropCommand = adminConnection.CreateCommand();
        dropCommand.CommandText = $"DROP DATABASE IF EXISTS {QuoteIdentifier(_databaseName)} WITH (FORCE)";
        await dropCommand.ExecuteNonQueryAsync();
    }

    public MovelyDbContext CreateDbContext()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString))
        {
            throw new InvalidOperationException("PostgreSQL integration tests are not configured.");
        }

        var options = new DbContextOptionsBuilder<MovelyDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;

        return new MovelyDbContext(options);
    }

    public async Task ResetAsync()
    {
        await using var db = CreateDbContext();
        await db.Database.ExecuteSqlRawAsync("""
            TRUNCATE TABLE
                "BusinessSubscriptions",
                "BusinessVerifications",
                "PhoneVerifications",
                "UserAuthIdentities",
                "UserSessions",
                "Businesses",
                "Users"
            RESTART IDENTITY CASCADE;
            """);
    }

    private static string QuoteIdentifier(string value)
        => "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
}
