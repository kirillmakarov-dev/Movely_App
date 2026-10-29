using System.Text.Json;
using System.Text.Json.Serialization;

namespace Movely.Api.Tests;

internal static class ApiJson
{
    // Match the browser-facing HTTP contract while retaining numeric input compatibility.
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };
}
