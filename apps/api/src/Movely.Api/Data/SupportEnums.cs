namespace Movely.Api.Data;

public enum SupportRequestType { General, PrivacyAccess, PrivacyCorrection, PrivacyDeletion }
public enum SupportRequestStatus { Open, InReview, WaitingForUser, Resolved, Cancelled }
public enum SupportEventActor { Owner, Support }
public enum SupportEventKind { Created, Message, StatusChanged, Cancelled }
