using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;

namespace Movely.Api.Modules.MoveRequests;

// One SQL definition is shared by marketplace reads and owner publication diagnostics.
public static class RequestPublicationEligibility
{
    private static readonly PreferredMoveTime[] Times = Enum.GetValues<PreferredMoveTime>();
    private static readonly MoveDateFlexibility[] Flexibilities = Enum.GetValues<MoveDateFlexibility>();
    private static readonly MoveBudgetBand[] Budgets = Enum.GetValues<MoveBudgetBand>();
    private static readonly MoveItemKind[] Kinds = Enum.GetValues<MoveItemKind>();
    private static readonly ApartmentInventoryItemType[] InventoryTypes = Enum.GetValues<ApartmentInventoryItemType>();
    private static readonly SpecialItemType[] SpecialTypes = Enum.GetValues<SpecialItemType>();
    private static readonly SmallMoveItemCategory[] Categories = Enum.GetValues<SmallMoveItemCategory>();
    private static readonly ElevatorFurnitureSuitability[] ElevatorSuitabilities = Enum.GetValues<ElevatorFurnitureSuitability>();
    // Match .NET whitespace semantics, including Unicode whitespace, on PostgreSQL.
    private const string Whitespace = "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";

    public static IQueryable<MoveRequest> Eligible(MovelyDbContext db, DateOnly today)
        => Assess(db, today).Where(a => a.IsActive && a.SalesOpen && a.HasPublishedAt && a.RecipientLimitValid &&
            a.OwnerEligible && a.PhoneVerified && a.PolicyCurrent && a.VersionValid && a.MoveDateValid && a.ContentComplete && a.SharingCurrent)
            .Select(a => a.Request);

    public static IQueryable<RequestPublicationAssessment> Assess(MovelyDbContext db, DateOnly today)
    {
        var version = ConsentPolicy.Version;
        var testOnly = ConsentPolicy.IsDraft;
        return db.MoveRequests.AsNoTracking().Select(x => new RequestPublicationAssessment {
            Request = x,
            IsActive = x.Status == MoveRequestStatus.Active,
            SalesOpen = x.LeadSalesStatus == LeadSalesStatus.Available || x.LeadSalesStatus == LeadSalesStatus.SoldOut,
            HasPublishedAt = x.PublishedAt != null,
            RecipientLimitValid = x.MaxLeadBuyers > 0 && x.ActiveBuyerCount >= 0,
            OwnerEligible = x.CustomerUser != null && x.CustomerUser.Status == UserStatus.Active && x.CustomerUser.Role == UserRole.Customer,
            PhoneVerified = x.CustomerUser != null && x.CustomerUser.PhoneVerified,
            PolicyCurrent = db.PolicyAcceptances.Any(a => a.UserId == x.CustomerUserId && a.AdultConfirmed && a.TermsVersion == version && a.PrivacyVersion == version && a.IsTestOnly == testOnly),
            VersionValid = x.CurrentVersion != null && x.CurrentVersion.MoveRequestId == x.Id && x.CurrentVersion.RequestType == x.RequestType,
            MoveDateValid = x.CurrentVersion != null && x.CurrentVersion.MoveDate >= today,
            ContentComplete = x.CurrentVersion != null &&
                x.CurrentVersion.PreferredTime.HasValue && Times.Contains(x.CurrentVersion.PreferredTime.Value) &&
                x.CurrentVersion.DateFlexibility.HasValue && Flexibilities.Contains(x.CurrentVersion.DateFlexibility.Value) &&
                (!x.CurrentVersion.BudgetBand.HasValue || Budgets.Contains(x.CurrentVersion.BudgetBand.Value)) &&
                ((x.RequestType == MoveRequestType.ApartmentMove && x.CurrentVersion.NumberOfRooms >= 1 && x.CurrentVersion.NumberOfRooms <= 20) ||
                 (x.RequestType == MoveRequestType.SmallMove && x.CurrentVersion.Items.Any(i => i.Kind == MoveItemKind.SmallMoveItem))) &&
                x.CurrentVersion.SmallBoxCount >= 0 && x.CurrentVersion.MediumBoxCount >= 0 && x.CurrentVersion.LargeBoxCount >= 0 &&
                x.CurrentVersion.Locations.Any(l => l.LocationType == MoveLocationType.Pickup && l.City != null && l.City.Trim(Whitespace.ToCharArray()) != "" && l.ExactAddress != null && l.ExactAddress.Trim(Whitespace.ToCharArray()) != "") &&
                x.CurrentVersion.Locations.Any(l => l.LocationType == MoveLocationType.Destination && l.City != null && l.City.Trim(Whitespace.ToCharArray()) != "" && l.ExactAddress != null && l.ExactAddress.Trim(Whitespace.ToCharArray()) != "") &&
                x.CurrentVersion.Locations.All(l => ElevatorSuitabilities.Contains(l.ElevatorFurnitureSuitability) &&
                    (!l.Floor.HasValue || (l.Floor >= -5 && l.Floor <= 200)) && (!l.ParkingDistanceMeters.HasValue || l.ParkingDistanceMeters >= 0)) &&
                x.CurrentVersion.Items.All(i => Kinds.Contains(i.Kind) && i.Quantity > 0 &&
                    ((i.Kind == MoveItemKind.ApartmentInventory && i.ApartmentInventoryType.HasValue) ||
                     (i.Kind == MoveItemKind.SmallMoveItem && i.SmallMoveCategory.HasValue) ||
                     (i.Kind == MoveItemKind.SpecialItem && i.SpecialItemType.HasValue)) &&
                    (!i.LengthCm.HasValue || i.LengthCm >= 0) && (!i.WidthCm.HasValue || i.WidthCm >= 0) &&
                    (!i.HeightCm.HasValue || i.HeightCm >= 0) && (!i.ApproximateWeightKg.HasValue || i.ApproximateWeightKg >= 0) &&
                    (!i.ApartmentInventoryType.HasValue || InventoryTypes.Contains(i.ApartmentInventoryType.Value)) &&
                    (!i.SpecialItemType.HasValue || SpecialTypes.Contains(i.SpecialItemType.Value)) &&
                    (!i.SmallMoveCategory.HasValue || Categories.Contains(i.SmallMoveCategory.Value))),
            SharingCurrent = db.ContactSharingAcceptances.Any(a => a.UserId == x.CustomerUserId && a.MoveRequestId == x.Id && a.RequestVersionId == x.CurrentVersionId &&
                a.DisclosureVersion == version && a.MaxRecipients == x.MaxLeadBuyers && a.IsTestOnly == testOnly),
            SharingAcceptedAt = db.ContactSharingAcceptances.Where(a => a.UserId == x.CustomerUserId && a.MoveRequestId == x.Id && a.RequestVersionId == x.CurrentVersionId &&
                a.DisclosureVersion == version && a.MaxRecipients == x.MaxLeadBuyers && a.IsTestOnly == testOnly).Select(a => (DateTimeOffset?)a.AcceptedAt).FirstOrDefault(),
            SharingHistoryConflict = db.ContactSharingAcceptances.Any(a => a.UserId != x.CustomerUserId && a.MoveRequestId == x.Id && a.RequestVersionId == x.CurrentVersionId &&
                a.DisclosureVersion == version && a.MaxRecipients == x.MaxLeadBuyers && a.IsTestOnly == testOnly),
        });
    }
}

public sealed class RequestPublicationAssessment
{
    public MoveRequest Request { get; init; } = null!;
    public bool IsActive { get; init; }
    public bool SalesOpen { get; init; }
    public bool HasPublishedAt { get; init; }
    public bool RecipientLimitValid { get; init; }
    public bool OwnerEligible { get; init; }
    public bool PhoneVerified { get; init; }
    public bool PolicyCurrent { get; init; }
    public bool VersionValid { get; init; }
    public bool MoveDateValid { get; init; }
    public bool ContentComplete { get; init; }
    public bool SharingCurrent { get; init; }
    public DateTimeOffset? SharingAcceptedAt { get; init; }
    public bool SharingHistoryConflict { get; init; }
}
