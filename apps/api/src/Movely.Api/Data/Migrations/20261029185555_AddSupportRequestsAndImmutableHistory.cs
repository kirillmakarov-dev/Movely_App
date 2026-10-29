using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Movely.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportRequestsAndImmutableHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SupportRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientMutationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Subject = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastSequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportRequests_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupportRequestEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupportRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientMutationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpectedRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    Actor = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RequestedStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    PreviousStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportRequestEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportRequestEvents_SupportRequests_SupportRequestId",
                        column: x => x.SupportRequestId,
                        principalTable: "SupportRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupportRequestEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequestEvents_ActorMutation",
                table: "SupportRequestEvents",
                columns: new[] { "SupportRequestId", "ActorUserId", "ClientMutationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequestEvents_ActorUserId",
                table: "SupportRequestEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequestEvents_SupportRequestId_SequenceNumber",
                table: "SupportRequestEvents",
                columns: new[] { "SupportRequestId", "SequenceNumber" },
                unique: true,
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequests_OwnerUserId_ClientMutationId",
                table: "SupportRequests",
                columns: new[] { "OwnerUserId", "ClientMutationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequests_OwnerUserId_UpdatedAt_Id",
                table: "SupportRequests",
                columns: new[] { "OwnerUserId", "UpdatedAt", "Id" },
                descending: new[] { false, true, false });

            migrationBuilder.CreateIndex(
                name: "IX_SupportRequests_Status_UpdatedAt_Id",
                table: "SupportRequests",
                columns: new[] { "Status", "UpdatedAt", "Id" },
                descending: new[] { false, true, false });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Submitted requests and audit messages must never be discarded by schema rollback.
            migrationBuilder.Sql(@"DO $$ BEGIN IF EXISTS (SELECT 1 FROM ""SupportRequests"") OR EXISTS (SELECT 1 FROM ""SupportRequestEvents"") THEN RAISE EXCEPTION 'Support requests exist; preserve them and use a reviewed forward migration.'; END IF; END $$;");

            migrationBuilder.DropTable(
                name: "SupportRequestEvents");

            migrationBuilder.DropTable(
                name: "SupportRequests");
        }
    }
}
