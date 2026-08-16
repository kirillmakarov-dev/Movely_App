namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class MoveItem
{
    public Guid Id { get; set; }
    public Guid MoveRequestVersionId { get; set; }
    public MoveItemKind Kind { get; set; }
    public ApartmentInventoryItemType? ApartmentInventoryType { get; set; }
    public SpecialItemType? SpecialItemType { get; set; }
    public SmallMoveItemCategory? SmallMoveCategory { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int Quantity { get; set; }
    public decimal? LengthCm { get; set; }
    public decimal? WidthCm { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? ApproximateWeightKg { get; set; }

    public MoveRequestVersion? MoveRequestVersion { get; set; }
}
