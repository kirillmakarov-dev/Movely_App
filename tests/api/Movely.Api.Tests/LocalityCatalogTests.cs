using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Movely.Api.Modules.Localities;

namespace Movely.Api.Tests;

public sealed class LocalityCatalogTests
{
    private static readonly LocalityCatalog Catalog = new();
    private const string Prefix = "Movely.Localities.localities.piba.2026-10-25";

    [Fact]
    public void PackagedCatalogMatchesReviewedChecksumAndEveryCanonicalRecord()
    {
        var catalog = Resource(Prefix + ".json");
        using var manifest = JsonDocument.Parse(Resource(Prefix + ".manifest.json"));
        var metadata = manifest.RootElement;
        Assert.Equal("2026-10-25", LocalityCatalog.SnapshotVersion);
        Assert.Equal("2026-10-25", metadata.GetProperty("snapshotVersion").GetString());
        Assert.Equal("ea4b59ed442e95de70e1e1bed42a14434395fa7b905c8bac0901491cf7934a96", metadata.GetProperty("sourceSha256").GetString());
        Assert.Equal("5eeaa35474b6327de57bad5ff367a2c3b9739d4e1d8d65d18c97ea28fc6fc9a0", Hash(catalog));
        Assert.Equal(Hash(catalog), metadata.GetProperty("catalogSha256").GetString());
        Assert.Equal(1316, metadata.GetProperty("sourceRowCount").GetInt32());
        Assert.Equal(1316, metadata.GetProperty("localityCount").GetInt32());
        Assert.Empty(metadata.GetProperty("excludedRecords").EnumerateArray());
        // Full source checksum and source-to-catalog projection are verified offline
        // by tools/import_localities.py; the government archive is not runtime data.
        Assert.DoesNotContain(Prefix + ".source.json", typeof(LocalityCatalog).Assembly.GetManifestResourceNames());
        using var canonical = JsonDocument.Parse(catalog);
        Assert.Equal(1316, canonical.RootElement.GetArrayLength());
        Assert.Equal(1316, Catalog.All.Count);
        Assert.Equal(1316, Catalog.All.Select(locality => locality.Code).Distinct().Count());
        foreach (var record in canonical.RootElement.EnumerateArray())
        {
            var code = record.GetProperty("code").GetString()!;
            var expectedName = record.GetProperty("name").GetString()!;
            var locality = Assert.IsType<LocalityDto>(Catalog.FindByCode(code));
            Assert.Equal(expectedName, locality.Name);
            Assert.Same(locality, Catalog.ResolveName(expectedName));
        }
        Assert.DoesNotContain(Catalog.All, locality => locality.Code == "0" || string.IsNullOrWhiteSpace(locality.Name));
        var list = Assert.IsAssignableFrom<IList<LocalityDto>>(Catalog.All);
        Assert.True(list.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => list[0] = new LocalityDto("0", "unreviewed"));
    }

    [Theory]
    [InlineData("חיפה", "4000", "חיפה")]
    [InlineData("  חיפה  ", "4000", "חיפה")]
    [InlineData("  TEL   AVIV - YAFO ", "5000", "תל אביב - יפו")]
    [InlineData("haifa", "4000", "חיפה")]
    [InlineData("תל אביב - יפו", "5000", "תל אביב - יפו")]
    [InlineData("שחר", "7", "שחר")]
    public void ResolvesOnlyWholeOfficialNamesToCanonicalHebrew(string name, string code, string canonicalName)
    {
        var locality = Assert.IsType<LocalityDto>(Catalog.ResolveName(name));
        Assert.Equal(code, locality.Code);
        Assert.Equal(canonicalName, locality.Name);
        Assert.Same(Catalog.FindByCode(code), locality);
    }

    [Fact]
    public void CollapsesUnicodeWhitespaceButDoesNotChangePunctuation()
    {
        var spaced = "תל" + (char)0x00A0 + "אביב  - " + (char)0x2003 + "יפו";
        Assert.Equal("5000", Catalog.ResolveName(spaced)?.Code);
        Assert.Null(Catalog.ResolveName("תל אביב-יפו"));
        Assert.Null(Catalog.ResolveName("תל אביב"));
    }

    [Theory]
    [InlineData("ABU QUREINAT")]
    [InlineData("KHAWALED")]
    [InlineData("TARABIN AS-SANI")]
    [InlineData("ZOHAR")]
    public void AmbiguousOfficialEnglishNamesNeverChooseTheFirstRecord(string name)
    {
        Assert.Null(Catalog.ResolveName(name));
        Assert.Null(Catalog.ResolveName(name.ToLowerInvariant()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("4000")]
    [InlineData("0")]
    [InlineData("999999")]
    [InlineData("חיפ")]
    [InlineData("Haifa, Herzl 1")]
    [InlineData("חיפה 0501234567")]
    [InlineData("contact@example.com")]
    [InlineData("https://example.com/Haifa")]
    [InlineData("<script>Haifa</script>")]
    [InlineData("Private Address, Apartment 42")]
    public void UnknownOrPrivateFreeTextIsNeverReturned(string? raw)
        => Assert.Null(Catalog.ResolveName(raw));

    [Fact]
    public void MalformedUnicodeControlCharactersAndOverlongInputFailClosed()
    {
        foreach (var raw in new[] {
            new string((char)0xD800, 1), new string((char)0xDC00, 1),
            "חיפה" + (char)0x202E, "Haifa" + (char)0, new string(' ', 121) + "Haifa"
        }) Assert.Null(Catalog.ResolveName(raw));
    }

    [Theory]
    [InlineData("04000")]
    [InlineData("+4000")]
    [InlineData(" 4000 ")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("4000.0")]
    [InlineData("4000/address")]
    [InlineData("Haifa")]
    public void CodeLookupRequiresCanonicalIdentifier(string code)
        => Assert.Null(Catalog.FindByCode(code));

    private static byte[] Resource(string name)
    {
        using var stream = typeof(LocalityCatalog).Assembly.GetManifestResourceStream(name);
        Assert.NotNull(stream);
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }

    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}

[Trait("Category", "Integration")]
public sealed class LocalityEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task AnonymousEndpointReturnsTheCompleteCanonicalPublicDictionaryOnly()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        using var response = await client.GetAsync("/api/v1/localities");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, json.RootElement.ValueKind);
        Assert.Equal(1316, json.RootElement.GetArrayLength());
        var catalog = new LocalityCatalog();
        foreach (var item in json.RootElement.EnumerateArray())
        {
            Assert.Equal(new[] { "code", "name" }, item.EnumerateObject().Select(property => property.Name).OrderBy(name => name));
            var code = item.GetProperty("code").GetString()!;
            Assert.Equal(catalog.FindByCode(code)!.Name, item.GetProperty("name").GetString());
        }
        Assert.Equal(1316, json.RootElement.EnumerateArray().Select(item => item.GetProperty("code").GetString()).Distinct().Count());
    }
}
