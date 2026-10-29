using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Identity;

public sealed record PolicyAcceptanceRequest(bool AdultConfirmed, bool AcceptTerms, string TermsVersion, string PrivacyVersion);
public sealed record ContactSharingRequest(bool ShareContacts, string DisclosureVersion, int MaxRecipients);

public static class ConsentPolicy
{
    // Keep this version aligned with the reviewed document source. Drafts are
    // available only for local/testing workflows, never public registration.
    public const string Version = "draft-2026-10-29-v2";
    public static bool IsDraft => Version.StartsWith("draft-", StringComparison.Ordinal);

    public static void EnsureAvailable(IHostEnvironment environment)
    {
        if (IsDraft && !environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
            throw new ApiException("LEGAL_NOT_READY", "Registration and publication are unavailable until approved policies are published.", 503);
    }

    public static void Validate(PolicyAcceptanceRequest? acceptance)
    {
        if (acceptance is null || !acceptance.AdultConfirmed || !acceptance.AcceptTerms)
            throw new ApiException("POLICY_ACCEPTANCE_REQUIRED", "Confirm age 18 or older and accept the terms after reading the privacy notice.");
        if (acceptance.TermsVersion != Version || acceptance.PrivacyVersion != Version)
            throw new ApiException("POLICY_VERSION_CHANGED", "The policies changed. Read the current documents and confirm again.", 409);
    }

    public static Task<bool> HasCurrentAsync(MovelyDbContext db, Guid userId, CancellationToken ct = default)
        => db.PolicyAcceptances.AnyAsync(x => x.UserId == userId && x.AdultConfirmed &&
            x.TermsVersion == Version && x.PrivacyVersion == Version && x.IsTestOnly == IsDraft, ct);

    public static void Add(MovelyDbContext db, Guid userId, DateTimeOffset now)
        => db.PolicyAcceptances.Add(new PolicyAcceptance {
            Id = Guid.NewGuid(), UserId = userId, TermsVersion = Version, PrivacyVersion = Version,
            AdultConfirmed = true, AcceptedAt = now, IsTestOnly = IsDraft,
        });
}

public interface IConsentReleaseGate { void EnsureAvailable(); }
public sealed class ConsentReleaseGate(IHostEnvironment environment) : IConsentReleaseGate
{
    public void EnsureAvailable() => ConsentPolicy.EnsureAvailable(environment);
}
