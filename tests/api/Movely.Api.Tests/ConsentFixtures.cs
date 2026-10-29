using Movely.Api.Modules.Identity;

namespace Movely.Api.Tests;

internal static class ConsentFixtures
{
    public static PolicyAcceptanceRequest Acceptance => new(true, true, ConsentPolicy.Version, ConsentPolicy.Version);
    public static ContactSharingRequest Sharing => new(true, ConsentPolicy.Version, 3);
    public sealed class TestReadyGate : IConsentReleaseGate { public void EnsureAvailable() { } }
}
