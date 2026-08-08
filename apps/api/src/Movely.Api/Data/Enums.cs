namespace Movely.Api.Data;

public enum UserRole
{
    Customer = 0,
    Mover = 1,
    Admin = 2
}

public enum UserStatus
{
    Active = 0,
    Suspended = 1
}

public enum AuthProvider
{
    Google = 0,
    Phone = 1
}

public enum PhoneVerificationPurpose
{
    CustomerPublishVerification = 0,
    Login = 1
}

public enum BusinessStatus
{
    PendingVerification = 0,
    Verified = 1,
    Suspended = 2,
    Rejected = 3
}

public enum SubscriptionStatus
{
    Inactive = 0,
    Active = 1,
    PastDue = 2,
    Cancelled = 3,
    Expired = 4
}

