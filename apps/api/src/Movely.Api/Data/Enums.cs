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

public enum MoveRequestType
{
    ApartmentMove = 0,
    SmallMove = 1
}

public enum MoveRequestStatus
{
    Draft = 0,
    Published = 1,
    Active = 2,
    Closed = 3,
    Cancelled = 4,
    Expired = 5
}

public enum LeadSalesStatus
{
    Available = 0,
    SoldOut = 1,
    Closed = 2
}

public enum MoveLocationType
{
    Pickup = 0,
    Destination = 1
}

public enum ElevatorFurnitureSuitability
{
    Unknown = 0,
    Yes = 1,
    No = 2
}

public enum MoveItemKind
{
    ApartmentInventory = 0,
    SmallMoveItem = 1,
    SpecialItem = 2
}

public enum ApartmentInventoryItemType
{
    Sofa = 0,
    Bed = 1,
    Mattress = 2,
    Wardrobe = 3,
    Dresser = 4,
    Table = 5,
    Chair = 6,
    Refrigerator = 7,
    WashingMachine = 8,
    Dryer = 9,
    Oven = 10,
    Television = 11,
    Desk = 12,
    Bookshelf = 13,
    Custom = 14
}

public enum SpecialItemType
{
    Piano = 0,
    Safe = 1,
    OversizedRefrigerator = 2,
    Glass = 3,
    Artwork = 4,
    Antique = 5,
    HeavyObject = 6,
    FragileEquipment = 7,
    Other = 8
}

public enum SmallMoveItemCategory
{
    Furniture = 0,
    Electronics = 1,
    Appliance = 2,
    Boxes = 3,
    Equipment = 4,
    Other = 5
}

public enum PreferredMoveTime
{
    Morning = 0,
    Afternoon = 1,
    Evening = 2,
    Flexible = 3
}

public enum MoveDateFlexibility
{
    Exact = 0,
    PlusMinusOneDay = 1,
    PlusMinusThreeDays = 2,
    WithinOneWeek = 3
}

public enum MoveBudgetBand
{
    UpTo1000 = 0,
    From1000To1500 = 1,
    From1500To2000 = 2,
    From2000To3000 = 3,
    From3000To5000 = 4,
    From5000Plus = 5,
    Unknown = 6
}
