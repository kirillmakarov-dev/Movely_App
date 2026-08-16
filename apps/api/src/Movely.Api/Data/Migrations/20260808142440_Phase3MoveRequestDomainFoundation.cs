using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Movely.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase3MoveRequestDomainFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MoveItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveRequestVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ApartmentInventoryType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SpecialItemType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SmallMoveCategory = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    LengthCm = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    WidthCm = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    HeightCm = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    ApproximateWeightKg = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoveItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MoveLocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveRequestVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    City = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    ExactAddress = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Floor = table.Column<int>(type: "integer", nullable: true),
                    HasElevator = table.Column<bool>(type: "boolean", nullable: true),
                    ElevatorFurnitureSuitability = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StairsInfo = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TruckAccessInfo = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ParkingDistanceMeters = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoveLocations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MovePhotos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveRequestVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ObjectKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    OriginalFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MovePhotos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MoveRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    LeadSalesStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CurrentVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    LeadPriceAgorot = table.Column<int>(type: "integer", nullable: false),
                    MaxLeadBuyers = table.Column<int>(type: "integer", nullable: false),
                    ActiveBuyerCount = table.Column<int>(type: "integer", nullable: false),
                    DuplicateRisk = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ExpiredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoveRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MoveRequests_Users_CustomerUserId",
                        column: x => x.CustomerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MoveRequestVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RequestType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NumberOfRooms = table.Column<int>(type: "integer", nullable: true),
                    SmallBoxCount = table.Column<int>(type: "integer", nullable: false),
                    MediumBoxCount = table.Column<int>(type: "integer", nullable: false),
                    LargeBoxCount = table.Column<int>(type: "integer", nullable: false),
                    FurnitureDisassembly = table.Column<bool>(type: "boolean", nullable: false),
                    FurnitureAssembly = table.Column<bool>(type: "boolean", nullable: false),
                    PackingAssistance = table.Column<bool>(type: "boolean", nullable: false),
                    PackingMaterials = table.Column<bool>(type: "boolean", nullable: false),
                    MoveDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PreferredTime = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    DateFlexibility = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    BudgetBand = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CustomerComment = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoveRequestVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MoveRequestVersions_MoveRequests_MoveRequestId",
                        column: x => x.MoveRequestId,
                        principalTable: "MoveRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MoveRequestVersions_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MoveItems_MoveRequestVersionId_Kind",
                table: "MoveItems",
                columns: new[] { "MoveRequestVersionId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveLocations_MoveRequestVersionId_LocationType",
                table: "MoveLocations",
                columns: new[] { "MoveRequestVersionId", "LocationType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MovePhotos_MoveRequestVersionId_DisplayOrder",
                table: "MovePhotos",
                columns: new[] { "MoveRequestVersionId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveRequests_CurrentVersionId",
                table: "MoveRequests",
                column: "CurrentVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_MoveRequests_CustomerUserId_Status",
                table: "MoveRequests",
                columns: new[] { "CustomerUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveRequests_RequestType_Status_LeadSalesStatus",
                table: "MoveRequests",
                columns: new[] { "RequestType", "Status", "LeadSalesStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveRequestVersions_CreatedByUserId",
                table: "MoveRequestVersions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MoveRequestVersions_MoveRequestId_VersionNumber",
                table: "MoveRequestVersions",
                columns: new[] { "MoveRequestId", "VersionNumber" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_MoveItems_MoveRequestVersions_MoveRequestVersionId",
                table: "MoveItems",
                column: "MoveRequestVersionId",
                principalTable: "MoveRequestVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_MoveLocations_MoveRequestVersions_MoveRequestVersionId",
                table: "MoveLocations",
                column: "MoveRequestVersionId",
                principalTable: "MoveRequestVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_MovePhotos_MoveRequestVersions_MoveRequestVersionId",
                table: "MovePhotos",
                column: "MoveRequestVersionId",
                principalTable: "MoveRequestVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_MoveRequests_MoveRequestVersions_CurrentVersionId",
                table: "MoveRequests",
                column: "CurrentVersionId",
                principalTable: "MoveRequestVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MoveRequests_MoveRequestVersions_CurrentVersionId",
                table: "MoveRequests");

            migrationBuilder.DropTable(
                name: "MoveItems");

            migrationBuilder.DropTable(
                name: "MoveLocations");

            migrationBuilder.DropTable(
                name: "MovePhotos");

            migrationBuilder.DropTable(
                name: "MoveRequestVersions");

            migrationBuilder.DropTable(
                name: "MoveRequests");
        }
    }
}
