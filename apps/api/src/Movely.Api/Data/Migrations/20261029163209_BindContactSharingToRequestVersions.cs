using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Movely.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class BindContactSharingToRequestVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ContactSharingAcceptances_MoveRequestId",
                table: "ContactSharingAcceptances");

            migrationBuilder.CreateIndex(
                name: "IX_ContactSharingAcceptances_VersionDisclosure",
                table: "ContactSharingAcceptances",
                columns: new[] { "MoveRequestId", "RequestVersionId", "DisclosureVersion", "MaxRecipients", "IsTestOnly" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ContactSharingAcceptances_VersionDisclosure",
                table: "ContactSharingAcceptances");

            migrationBuilder.CreateIndex(
                name: "IX_ContactSharingAcceptances_MoveRequestId",
                table: "ContactSharingAcceptances",
                column: "MoveRequestId",
                unique: true);
        }
    }
}
