using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Movely.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddVersionedConsentRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContactSharingAcceptances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MoveRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisclosureVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    MaxRecipients = table.Column<int>(type: "integer", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsTestOnly = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContactSharingAcceptances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContactSharingAcceptances_MoveRequestVersions_RequestVersio~",
                        column: x => x.RequestVersionId,
                        principalTable: "MoveRequestVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContactSharingAcceptances_MoveRequests_MoveRequestId",
                        column: x => x.MoveRequestId,
                        principalTable: "MoveRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ContactSharingAcceptances_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PolicyAcceptances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TermsVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PrivacyVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AdultConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsTestOnly = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PolicyAcceptances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PolicyAcceptances_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContactSharingAcceptances_MoveRequestId",
                table: "ContactSharingAcceptances",
                column: "MoveRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContactSharingAcceptances_RequestVersionId",
                table: "ContactSharingAcceptances",
                column: "RequestVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_ContactSharingAcceptances_UserId",
                table: "ContactSharingAcceptances",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PolicyAcceptances_UserId_TermsVersion_PrivacyVersion",
                table: "PolicyAcceptances",
                columns: new[] { "UserId", "TermsVersion", "PrivacyVersion" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContactSharingAcceptances");

            migrationBuilder.DropTable(
                name: "PolicyAcceptances");
        }
    }
}
