namespace Movely.Api.Shared.Time;

public static class BusinessCalendar
{
    private static readonly TimeZoneInfo IsraelTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Jerusalem");

    // Move dates describe a calendar day in the service's Israeli market.
    // Publication and marketplace expiry must cross midnight together.
    public static DateOnly Today(DateTimeOffset instant)
        => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, IsraelTimeZone).DateTime);
}
