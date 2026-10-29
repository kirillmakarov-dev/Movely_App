using System.Collections.Frozen;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Movely.Api.Modules.Localities;

public sealed record LocalityDto(string Code, string Name);

public interface ILocalityCatalog
{
    IReadOnlyList<LocalityDto> All { get; }
    LocalityDto? FindByCode(string code);
    LocalityDto? ResolveName(string? name);
}

public sealed class LocalityCatalog : ILocalityCatalog
{
    public const string SnapshotVersion = "2026-10-25";
    private const string ResourcePrefix = "Movely.Localities.localities.piba." + SnapshotVersion;
    private readonly FrozenDictionary<string, LocalityDto> _byCode;
    private readonly FrozenDictionary<string, LocalityDto?> _byName;

    public IReadOnlyList<LocalityDto> All { get; }

    public LocalityCatalog()
    {
        var assembly = typeof(LocalityCatalog).Assembly;
        using var manifestStream = OpenResource(assembly, ResourcePrefix + ".manifest.json");
        using var manifest = JsonDocument.Parse(manifestStream);
        using var catalogStream = OpenResource(assembly, ResourcePrefix + ".json");
        using var buffer = new MemoryStream();
        catalogStream.CopyTo(buffer);
        var bytes = buffer.ToArray();
        var checksum = Convert.ToHexString(SHA256.HashData(bytes));
        if (!string.Equals(checksum, manifest.RootElement.GetProperty("catalogSha256").GetString(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The embedded locality catalog checksum is invalid.");

        var rows = JsonSerializer.Deserialize<LocalityEntry[]>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("The embedded locality catalog is empty.");
        if (rows.Length < 1000 || rows.Length != manifest.RootElement.GetProperty("localityCount").GetInt32())
            throw new InvalidOperationException("The embedded locality catalog is incomplete.");

        var codes = new Dictionary<string, LocalityDto>(StringComparer.Ordinal);
        var names = new Dictionary<string, LocalityDto?>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            if (!int.TryParse(row.Code, NumberStyles.None, CultureInfo.InvariantCulture, out var numericCode)
                || numericCode < 1 || numericCode.ToString(CultureInfo.InvariantCulture) != row.Code
                || NormalizeName(row.Name) is null || row.Aliases is null)
                throw new InvalidOperationException("The embedded locality record is invalid.");
            var locality = new LocalityDto(row.Code, row.Name);
            if (!codes.TryAdd(locality.Code, locality))
                throw new InvalidOperationException("The embedded locality catalog contains duplicate codes.");
            AddName(row.Name, locality);
            foreach (var alias in row.Aliases) AddName(alias, locality);
        }
        _byCode = codes.ToFrozenDictionary(StringComparer.Ordinal);
        _byName = names.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);
        All = Array.AsReadOnly(rows.Select(row => codes[row.Code]).ToArray());

        void AddName(string name, LocalityDto locality)
        {
            var normalized = NormalizeName(name)
                ?? throw new InvalidOperationException("The embedded locality alias is invalid.");
            if (names.TryGetValue(normalized, out var previous))
            {
                // An ambiguous official alias stays unresolved, regardless of row order.
                if (previous?.Code != locality.Code) names[normalized] = null;
            }
            else names.Add(normalized, locality);
        }
    }

    public LocalityDto? FindByCode(string code)
        => code is not null && _byCode.TryGetValue(code, out var locality) ? locality : null;

    public LocalityDto? ResolveName(string? name)
    {
        var normalized = NormalizeName(name);
        return normalized is not null && _byName.TryGetValue(normalized, out var locality) ? locality : null;
    }

    private static string? NormalizeName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 120) return null;
        string normalized;
        try { normalized = value.Normalize(NormalizationForm.FormC).Trim(); }
        catch (ArgumentException) { return null; }
        var result = new StringBuilder(normalized.Length);
        var whitespace = false;
        foreach (var character in normalized)
        {
            if (char.IsWhiteSpace(character)) { whitespace = true; continue; }
            if (char.IsControl(character) || char.GetUnicodeCategory(character) == UnicodeCategory.Format) return null;
            if (whitespace && result.Length > 0) result.Append(' ');
            result.Append(character);
            whitespace = false;
        }
        return result.Length == 0 ? null : result.ToString();
    }

    private static Stream OpenResource(Assembly assembly, string name)
        => assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Missing embedded locality resource: {name}");

    private sealed record LocalityEntry(string Code, string Name, string[] Aliases);
}
