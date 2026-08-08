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
    }
}

