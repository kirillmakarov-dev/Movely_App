namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class MoveLocation
{
    public Guid Id { get; set; }
    public Guid MoveRequestVersionId { get; set; }
    public MoveLocationType LocationType { get; set; }
    public string? City { get; set; }
    public string? ExactAddress { get; set; }
    public int? Floor { get; set; }
    public bool? HasElevator { get; set; }
    public ElevatorFurnitureSuitability ElevatorFurnitureSuitability { get; set; } = ElevatorFurnitureSuitability.Unknown;
    public string? StairsInfo { get; set; }
    public string? TruckAccessInfo { get; set; }
    public int? ParkingDistanceMeters { get; set; }

    public MoveRequestVersion? MoveRequestVersion { get; set; }
}
