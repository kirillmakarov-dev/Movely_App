namespace Movely.Api.Shared.Errors;

public static class ApiErrorCodes
{
    public const string RequestNotActive = "REQUEST_NOT_ACTIVE";
    public const string LeadSoldOut = "LEAD_SOLD_OUT";
    public const string AlreadyPurchased = "ALREADY_PURCHASED";
    public const string InsufficientBalance = "INSUFFICIENT_BALANCE";
    public const string BusinessNotVerified = "BUSINESS_NOT_VERIFIED";
    public const string MoverRejected = "MOVER_REJECTED";
    public const string MoverBlocked = "MOVER_BLOCKED";
    public const string OfferStale = "OFFER_STALE";
    public const string RequestVersionChanged = "REQUEST_VERSION_CHANGED";
    public const string PhoneNotVerified = "PHONE_NOT_VERIFIED";
    public const string InternalServerError = "INTERNAL_SERVER_ERROR";
}

