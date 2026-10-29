using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

public sealed class BusinessCalendarTests
{
    [Theory]
    [InlineData("2026-01-10T21:59:59+00:00", "2026-01-10")]
    [InlineData("2026-01-10T22:00:00+00:00", "2026-01-11")]
    [InlineData("2026-07-10T20:59:59+00:00", "2026-07-10")]
    [InlineData("2026-07-10T21:00:00+00:00", "2026-07-11")]
    [InlineData("2026-07-10T17:00:00-04:00", "2026-07-11")]
    public void CalendarDayUsesIsraelOffsetIncludingSummerTime(string instant, string expected)
        => Assert.Equal(DateOnly.Parse(expected), BusinessCalendar.Today(DateTimeOffset.Parse(instant)));
}
