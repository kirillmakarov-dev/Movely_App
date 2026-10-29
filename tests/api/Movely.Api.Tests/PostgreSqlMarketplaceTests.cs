using System.Data.Common;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Movely.Api.Data;
using Movely.Api.Modules.Marketplace;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlMarketplaceTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    [SkippableFact]
    public async Task ServerPagingFiltersAndDetailSelectOnlyMarketplaceFields()
    {
        RequireDatabase();
        var now = DateTimeOffset.Parse("2040-06-11T12:00:00Z");
        Guid viewer;
        Guid[] ids;
        await using (var seed = fixture.CreateDbContext())
        {
            viewer = await MarketplaceTestData.SeedViewerAsync(seed);
            var first = await MarketplaceTestData.SeedAsync(seed, now);
            var second = await MarketplaceTestData.SeedAsync(seed, now);
            var third = await MarketplaceTestData.SeedAsync(seed, now);
            first.PublishedAt = now.AddMinutes(-1);
            second.PublishedAt = now.AddMinutes(-2);
            third.PublishedAt = now.AddMinutes(-3);
            await seed.SaveChangesAsync();
            ids = [first.Id, second.Id, third.Id];
        }
        var recorder = new QueryRecorder();
        await using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>().UseNpgsql(fixture.ConnectionString).AddInterceptors(recorder).Options);
        var service = MarketplaceTestData.Service(db, viewer, now);
        var search = MarketplaceTestData.Search() with { Page = 2, PageSize = 1, RequestType = MoveRequestType.SmallMove,
            PickupCityCode = "5000", DestinationCityCode = "4000", BudgetBand = MoveBudgetBand.Unknown, MoveDate = new DateOnly(2040, 6, 25) };
        var page = await service.ListAsync(search);
        Assert.Equal(3, page.TotalCount);
        Assert.Equal(ids[1], Assert.Single(page.Items).Id);
        var chronological = await service.ListAsync(search with { Sort = MarketplaceSort.MoveDate, Page = 1, PageSize = 12 });
        Assert.Equal(ids.Order(), chronological.Items.Select(x => x.Id));
        var detail = await service.GetAsync(ids[1]);
        Assert.Equal("5000", detail.PickupCity!.Code);
        Assert.Equal(2, detail.Items.Count);
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, JsonSerializer.Serialize(detail, ApiJson.Options));
        Assert.Empty(db.ChangeTracker.Entries());
        var requestCommands = recorder.Commands.Where(x => x.Contains("\"MoveRequests\"", StringComparison.Ordinal)).ToArray();
        Assert.NotEmpty(requestCommands);
        Assert.Contains(requestCommands, x => x.Contains("LIMIT", StringComparison.Ordinal) && x.Contains("OFFSET", StringComparison.Ordinal));
        foreach (var command in requestCommands)
        {
            var projections = SelectProjections(command).ToArray();
            Assert.NotEmpty(projections);
            foreach (var projection in projections)
            {
                Assert.DoesNotMatch("\\\"(?:City|ExactAddress|Name|Description|FirstName|LastName|Email|Phone|CustomerComment|StairsInfo|TruckAccessInfo|ObjectKey|OriginalFileName|CustomerUserId|LeadPriceAgorot)\\\"", projection);
                Assert.DoesNotMatch(@"\b\w+\.\*", projection);
            }
        }
    }

    [SkippableTheory]
    [InlineData("\t")]
    [InlineData("\u00a0")]
    [InlineData("\u3000")]
    [InlineData(" \r\n\t\u0085\u2007\u202f")]
    public async Task UnicodeWhitespaceOnlyPrivateRouteIsExcludedByPostgresPredicate(string whitespace)
    {
        RequireDatabase();
        var now = DateTimeOffset.Parse("2041-06-11T12:00:00Z");
        Guid viewer;
        Guid id;
        await using (var seed = fixture.CreateDbContext())
        {
            viewer = await MarketplaceTestData.SeedViewerAsync(seed);
            var request = await MarketplaceTestData.SeedAsync(seed, now);
            id = request.Id;
            var pickup = request.CurrentVersion!.Locations.Single(x => x.LocationType == MoveLocationType.Pickup);
            pickup.City = whitespace;
            pickup.ExactAddress = whitespace;
            await seed.SaveChangesAsync();
        }
        await using var db = fixture.CreateDbContext();
        var service = MarketplaceTestData.Service(db, viewer, now);
        var result = await service.ListAsync(MarketplaceTestData.Search() with { MoveDate = new DateOnly(2041, 6, 25) });
        Assert.DoesNotContain(result.Items, x => x.Id == id);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.GetAsync(id));
        Assert.Equal(404, error.StatusCode);
    }

    [SkippableFact]
    public async Task ConsentAndLifecycleChangesAreReevaluatedOnEveryPostgresRead()
    {
        RequireDatabase();
        var now = DateTimeOffset.Parse("2042-06-11T12:00:00Z");
        Guid viewer;
        Guid id;
        await using (var seed = fixture.CreateDbContext())
        {
            viewer = await MarketplaceTestData.SeedViewerAsync(seed);
            var request = await MarketplaceTestData.SeedAsync(seed, now);
            id = request.Id;
        }
        await using var db = fixture.CreateDbContext();
        var service = MarketplaceTestData.Service(db, viewer, now);
        Assert.Equal(id, (await service.GetAsync(id)).Id);
        await using (var change = fixture.CreateDbContext())
        {
            (await change.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == id)).DisclosureVersion = "outdated";
            await change.SaveChangesAsync();
        }
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => service.GetAsync(id))).StatusCode);
        await using (var change = fixture.CreateDbContext())
        {
            (await change.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == id)).DisclosureVersion = Movely.Api.Modules.Identity.ConsentPolicy.Version;
            (await change.MoveRequests.FindAsync(id))!.Status = MoveRequestStatus.Cancelled;
            await change.SaveChangesAsync();
        }
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => service.GetAsync(id))).StatusCode);
    }

    // Identify each SELECT list at its nesting depth; private columns are allowed in WHERE predicates.
    internal static IEnumerable<string> SelectProjections(string sql)
    {
        var depth = 0;
        var starts = new List<(int Depth, int Start)>();
        foreach (Match token in Regex.Matches(sql, @"\bSELECT\b|\bFROM\b|[()]", RegexOptions.IgnoreCase))
        {
            if (token.Value == "(") depth++;
            else if (token.Value == ")") depth--;
            else if (token.Value.Equals("SELECT", StringComparison.OrdinalIgnoreCase)) starts.Add((depth, token.Index + token.Length));
            else
            {
                var index = starts.FindLastIndex(x => x.Depth == depth);
                if (index < 0) continue;
                yield return sql[starts[index].Start..token.Index];
                starts.RemoveAt(index);
            }
        }
    }
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING for PostgreSQL integration tests.");
    private sealed class QueryRecorder : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}

[Trait("Category", "Integration")]
public sealed class MarketplaceQueryTranslationTests
{
    [Fact]
    public void NpgsqlTranslatesListAndDetailWithoutSelectingProtectedColumns()
    {
        // SQL generation needs no database connection; real execution remains covered by PostgreSQL tests above.
        using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>().UseNpgsql("Host=localhost;Database=unused_translation_test").Options);
        var service = MarketplaceTestData.Service(db, Guid.NewGuid());
        const System.Reflection.BindingFlags flags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;
        var eligible = (IQueryable<Movely.Api.Data.Entities.MoveRequest>)typeof(MarketplaceService).GetMethod("Eligible", flags)!.Invoke(service, null)!;
        var card = (System.Linq.Expressions.LambdaExpression)typeof(MarketplaceService).GetField("CardProjection", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.GetValue(null)!;
        var select = System.Linq.Expressions.Expression.Call(typeof(Queryable), nameof(Queryable.Select), [typeof(Movely.Api.Data.Entities.MoveRequest), card.ReturnType], eligible.Expression, System.Linq.Expressions.Expression.Quote(card));
        var list = eligible.Provider.CreateQuery(select);
        var detail = (IQueryable)typeof(MarketplaceService).GetMethod("DetailRows", flags)!.Invoke(service, [Guid.NewGuid()])!;
        foreach (var query in new[] { list, detail })
        {
            var sql = query.ToQueryString();
            Assert.Contains("btrim", sql);
            foreach (var projection in PostgreSqlMarketplaceTests.SelectProjections(sql))
                Assert.DoesNotMatch("\\\"(?:City|ExactAddress|Name|Description|FirstName|LastName|Email|Phone|CustomerComment|StairsInfo|TruckAccessInfo|ObjectKey|OriginalFileName|CustomerUserId|LeadPriceAgorot)\\\"", projection);
        }
    }
}
