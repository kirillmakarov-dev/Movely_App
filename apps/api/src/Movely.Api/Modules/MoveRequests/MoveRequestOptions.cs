namespace Movely.Api.Modules.MoveRequests;

public sealed class MoveRequestOptions
{
    public int DefaultApartmentMoveLeadPriceAgorot { get; set; } = 1000;
    public int DefaultSmallMoveLeadPriceAgorot { get; set; } = 500;
    public int DefaultMaxLeadBuyers { get; set; } = 3;
    public int MaxActiveRequestsPerCustomer { get; set; } = 3;
}
