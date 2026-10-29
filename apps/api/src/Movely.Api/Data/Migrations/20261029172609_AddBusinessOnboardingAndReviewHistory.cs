using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Movely.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessOnboardingAndReviewHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OwnerMessage",
                table: "BusinessVerifications",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RegistryChecked",
                table: "BusinessVerifications",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RepresentativeChecked",
                table: "BusinessVerifications",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ReviewedProfileRevisionId",
                table: "BusinessVerifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegisteredAddress",
                table: "Businesses",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegistrationNumber",
                table: "Businesses",
                type: "character varying(9)",
                maxLength: 9,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RepresentativeConfirmedAt",
                table: "Businesses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepresentativeName",
                table: "Businesses",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RevisionId",
                table: "Businesses",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string[]>(
                name: "ServiceAreaCodes",
                table: "Businesses",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            // Legacy businesses keep their status and receive a usable optimistic-concurrency revision.
            migrationBuilder.Sql(@"UPDATE ""Businesses"" SET ""RevisionId"" = gen_random_uuid() WHERE ""RevisionId"" = '00000000-0000-0000-0000-000000000000'::uuid;");

            migrationBuilder.CreateTable(
                name: "BusinessReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProfileRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    InternalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RegistryChecked = table.Column<bool>(type: "boolean", nullable: false),
                    RepresentativeChecked = table.Column<bool>(type: "boolean", nullable: false),
                    ProfileSnapshotJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessReviews_Businesses_BusinessId",
                        column: x => x.BusinessId,
                        principalTable: "Businesses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BusinessReviews_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Businesses_Status_UpdatedAt_Id",
                table: "Businesses",
                columns: new[] { "Status", "UpdatedAt", "Id" },
                descending: new[] { false, true, false });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessReviews_BusinessId_ProfileRevisionId",
                table: "BusinessReviews",
                columns: new[] { "BusinessId", "ProfileRevisionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BusinessReviews_BusinessId_ReviewedAt_Id",
                table: "BusinessReviews",
                columns: new[] { "BusinessId", "ReviewedAt", "Id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessReviews_ReviewedByUserId",
                table: "BusinessReviews",
                column: "ReviewedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Never erase submitted applications or immutable review evidence during rollback.
            migrationBuilder.Sql(@"DO $$ BEGIN IF EXISTS (SELECT 1 FROM ""BusinessReviews"") OR EXISTS (
                SELECT 1 FROM ""Businesses"" WHERE ""RegistrationNumber"" IS NOT NULL
                    OR ""RegisteredAddress"" IS NOT NULL OR ""RepresentativeName"" IS NOT NULL
                    OR ""RepresentativeConfirmedAt"" IS NOT NULL OR cardinality(""ServiceAreaCodes"") > 0
            ) THEN RAISE EXCEPTION 'Business onboarding data or review history exists; preserve it and use a reviewed forward migration.'; END IF; END $$;");

            migrationBuilder.DropTable(
                name: "BusinessReviews");

            migrationBuilder.DropIndex(
                name: "IX_Businesses_Status_UpdatedAt_Id",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "OwnerMessage",
                table: "BusinessVerifications");

            migrationBuilder.DropColumn(
                name: "RegistryChecked",
                table: "BusinessVerifications");

            migrationBuilder.DropColumn(
                name: "RepresentativeChecked",
                table: "BusinessVerifications");

            migrationBuilder.DropColumn(
                name: "ReviewedProfileRevisionId",
                table: "BusinessVerifications");

            migrationBuilder.DropColumn(
                name: "RegisteredAddress",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "RegistrationNumber",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "RepresentativeConfirmedAt",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "RepresentativeName",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "RevisionId",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "ServiceAreaCodes",
                table: "Businesses");
        }
    }
}
