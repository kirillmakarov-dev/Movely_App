namespace Movely.Api.Data;

using Microsoft.EntityFrameworkCore;
using Movely.Api.Data.Entities;

public sealed class MovelyDbContext : DbContext
{
    public MovelyDbContext(DbContextOptions<MovelyDbContext> options)
        : base(options)
    {
    }

    public DbSet<MovelyUser> Users => Set<MovelyUser>();
    public DbSet<UserAuthIdentity> UserAuthIdentities => Set<UserAuthIdentity>();
    public DbSet<PhoneVerification> PhoneVerifications => Set<PhoneVerification>();
    public DbSet<Business> Businesses => Set<Business>();
    public DbSet<BusinessVerification> BusinessVerifications => Set<BusinessVerification>();
    public DbSet<BusinessSubscription> BusinessSubscriptions => Set<BusinessSubscription>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<MoveRequest> MoveRequests => Set<MoveRequest>();
    public DbSet<MoveRequestVersion> MoveRequestVersions => Set<MoveRequestVersion>();
    public DbSet<MoveLocation> MoveLocations => Set<MoveLocation>();
    public DbSet<MoveItem> MoveItems => Set<MoveItem>();
    public DbSet<MovePhoto> MovePhotos => Set<MovePhoto>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MovelyUser>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.Phone).HasMaxLength(32);
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.CreatedAt);
            entity.Property(x => x.UpdatedAt);
        });

        modelBuilder.Entity<UserAuthIdentity>(entity =>
        {
            entity.ToTable("UserAuthIdentities");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Provider).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.ProviderSubject).HasMaxLength(255).IsRequired();
            entity.Property(x => x.CreatedAt);
            entity.HasIndex(x => new { x.Provider, x.ProviderSubject }).IsUnique();
            entity.HasOne(x => x.User)
                .WithMany(x => x.AuthIdentities)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PhoneVerification>(entity =>
        {
            entity.ToTable("PhoneVerifications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.NormalizedPhone).HasMaxLength(32).IsRequired();
            entity.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(64);
            entity.Property(x => x.CodeSalt).HasMaxLength(128).IsRequired();
            entity.Property(x => x.CodeHash).HasMaxLength(256).IsRequired();
            entity.Property(x => x.AttemptCount);
            entity.Property(x => x.MaxAttempts);
            entity.HasIndex(x => new { x.UserId, x.NormalizedPhone, x.Purpose });
            entity.HasOne(x => x.User)
                .WithMany(x => x.PhoneVerifications)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Business>(entity =>
        {
            entity.ToTable("Businesses");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.OwnerUserId).IsUnique();
            entity.HasOne(x => x.OwnerUser)
                .WithMany(x => x.OwnedBusinesses)
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BusinessVerification>(entity =>
        {
            entity.ToTable("BusinessVerifications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasIndex(x => x.BusinessId).IsUnique();
            entity.HasOne(x => x.Business)
                .WithOne(x => x.Verification)
                .HasForeignKey<BusinessVerification>(x => x.BusinessId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BusinessSubscription>(entity =>
        {
            entity.ToTable("BusinessSubscriptions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.BusinessId).IsUnique();
            entity.HasOne(x => x.Business)
                .WithOne(x => x.Subscription)
                .HasForeignKey<BusinessSubscription>(x => x.BusinessId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.ToTable("UserSessions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SessionTokenHash).HasMaxLength(256).IsRequired();
            entity.HasIndex(x => x.SessionTokenHash).IsUnique();
            entity.HasOne(x => x.User)
                .WithMany(x => x.Sessions)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MoveRequest>(entity =>
        {
            entity.ToTable("MoveRequests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.RequestType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.LeadSalesStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.LeadPriceAgorot);
            entity.Property(x => x.MaxLeadBuyers);
            entity.Property(x => x.ActiveBuyerCount);
            entity.Property(x => x.DuplicateRisk);
            entity.HasIndex(x => new { x.CustomerUserId, x.Status });
            entity.HasIndex(x => new { x.RequestType, x.Status, x.LeadSalesStatus });
            entity.HasOne(x => x.CustomerUser)
                .WithMany(x => x.MoveRequests)
                .HasForeignKey(x => x.CustomerUserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.CurrentVersion)
                .WithMany()
                .HasForeignKey(x => x.CurrentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MoveRequestVersion>(entity =>
        {
            entity.ToTable("MoveRequestVersions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.RequestType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.PreferredTime).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.DateFlexibility).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.BudgetBand).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.CustomerComment).HasMaxLength(2000);
            entity.HasIndex(x => new { x.MoveRequestId, x.VersionNumber }).IsUnique();
            entity.HasOne(x => x.MoveRequest)
                .WithMany(x => x.Versions)
                .HasForeignKey(x => x.MoveRequestId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedMoveRequestVersions)
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MoveLocation>(entity =>
        {
            entity.ToTable("MoveLocations");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.LocationType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.City).HasMaxLength(120);
            entity.Property(x => x.ExactAddress).HasMaxLength(300);
            entity.Property(x => x.ElevatorFurnitureSuitability).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.StairsInfo).HasMaxLength(500);
            entity.Property(x => x.TruckAccessInfo).HasMaxLength(500);
            entity.HasIndex(x => new { x.MoveRequestVersionId, x.LocationType }).IsUnique();
            entity.HasOne(x => x.MoveRequestVersion)
                .WithMany(x => x.Locations)
                .HasForeignKey(x => x.MoveRequestVersionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MoveItem>(entity =>
        {
            entity.ToTable("MoveItems");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.ApartmentInventoryType).HasConversion<string>().HasMaxLength(64);
            entity.Property(x => x.SpecialItemType).HasConversion<string>().HasMaxLength(64);
            entity.Property(x => x.SmallMoveCategory).HasConversion<string>().HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.LengthCm).HasPrecision(10, 2);
            entity.Property(x => x.WidthCm).HasPrecision(10, 2);
            entity.Property(x => x.HeightCm).HasPrecision(10, 2);
            entity.Property(x => x.ApproximateWeightKg).HasPrecision(10, 2);
            entity.HasIndex(x => new { x.MoveRequestVersionId, x.Kind });
            entity.HasOne(x => x.MoveRequestVersion)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.MoveRequestVersionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MovePhoto>(entity =>
        {
            entity.ToTable("MovePhotos");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ObjectKey).HasMaxLength(500).IsRequired();
            entity.Property(x => x.OriginalFileName).HasMaxLength(255);
            entity.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => new { x.MoveRequestVersionId, x.DisplayOrder });
            entity.HasOne(x => x.MoveRequestVersion)
                .WithMany(x => x.Photos)
                .HasForeignKey(x => x.MoveRequestVersionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
