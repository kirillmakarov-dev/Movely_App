namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class MoveRequestVersion
{
    public Guid Id { get; set; }
    public Guid MoveRequestId { get; set; }
    public int VersionNumber { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public MoveRequestType RequestType { get; set; }
    public int? NumberOfRooms { get; set; }
    public int SmallBoxCount { get; set; }
    public int MediumBoxCount { get; set; }
    public int LargeBoxCount { get; set; }
    public bool FurnitureDisassembly { get; set; }
    public bool FurnitureAssembly { get; set; }
    public bool PackingAssistance { get; set; }
    public bool PackingMaterials { get; set; }
    public DateOnly? MoveDate { get; set; }
    public PreferredMoveTime? PreferredTime { get; set; }
    public MoveDateFlexibility? DateFlexibility { get; set; }
    public MoveBudgetBand? BudgetBand { get; set; }
    public string? CustomerComment { get; set; }

    public MoveRequest? MoveRequest { get; set; }
    public MovelyUser? CreatedByUser { get; set; }
    public ICollection<MoveLocation> Locations { get; set; } = new List<MoveLocation>();
    public ICollection<MoveItem> Items { get; set; } = new List<MoveItem>();
    public ICollection<MovePhoto> Photos { get; set; } = new List<MovePhoto>();
}
