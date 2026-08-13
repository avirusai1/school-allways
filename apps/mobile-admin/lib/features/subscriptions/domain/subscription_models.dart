/// Mirrors GET /v1/subscriptions and stay-connected payloads.
class SubscriptionRow {
  const SubscriptionRow({
    required this.id,
    required this.fullName,
    required this.admissionNo,
    required this.subscribed,
    required this.status,
    this.classLabel,
    this.source,
    this.expiresAt,
    this.notes,
  });

  final String id;
  final String fullName;
  final String admissionNo;
  final String? classLabel;
  final bool subscribed;
  final String status;
  final String? source;
  final String? expiresAt;
  final String? notes;

  factory SubscriptionRow.fromJson(Map<String, dynamic> json) {
    return SubscriptionRow(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      admissionNo: json['admissionNo'] as String? ?? '',
      classLabel: json['classLabel'] as String?,
      subscribed: json['subscribed'] as bool? ?? false,
      status: json['status'] as String? ?? 'locked',
      source: json['source'] as String?,
      expiresAt: json['expiresAt'] as String?,
      notes: json['notes'] as String?,
    );
  }
}

class SubscriptionListMeta {
  const SubscriptionListMeta({
    required this.academicSessionId,
    required this.sessionName,
    required this.inGrace,
    required this.amountPaise,
    this.sessionEndDate,
    this.graceEndsAt,
  });

  final String academicSessionId;
  final String sessionName;
  final String? sessionEndDate;
  final bool inGrace;
  final String? graceEndsAt;
  final int amountPaise;

  factory SubscriptionListMeta.fromJson(Map<String, dynamic> json) {
    return SubscriptionListMeta(
      academicSessionId: json['academicSessionId'] as String? ?? '',
      sessionName: json['sessionName'] as String? ?? '',
      sessionEndDate: json['sessionEndDate'] as String?,
      inGrace: json['inGrace'] as bool? ?? false,
      graceEndsAt: json['graceEndsAt'] as String?,
      amountPaise: json['amountPaise'] as int? ?? 36500,
    );
  }
}

class SubscriptionList {
  const SubscriptionList({
    required this.data,
    required this.meta,
    this.nextCursor,
  });

  final List<SubscriptionRow> data;
  final SubscriptionListMeta meta;
  final String? nextCursor;

  factory SubscriptionList.fromJson(Map<String, dynamic> json) {
    return SubscriptionList(
      data: (json['data'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SubscriptionRow.fromJson)
          .toList(),
      nextCursor: json['nextCursor'] as String?,
      meta: SubscriptionListMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class StayConnectedFee {
  const StayConnectedFee({
    required this.id,
    required this.status,
    required this.totalPaise,
    required this.basePaise,
    required this.gstPaise,
    this.dueDate,
    this.paidAt,
    this.invoiceNumber,
  });

  final String id;
  final String status;
  final String? dueDate;
  final int totalPaise;
  final int basePaise;
  final int gstPaise;
  final String? paidAt;
  final String? invoiceNumber;

  factory StayConnectedFee.fromJson(Map<String, dynamic> json) {
    return StayConnectedFee(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
      dueDate: json['dueDate'] as String?,
      totalPaise: json['totalPaise'] as int? ?? 0,
      basePaise: json['basePaise'] as int? ?? 0,
      gstPaise: json['gstPaise'] as int? ?? 0,
      paidAt: json['paidAt'] as String?,
      invoiceNumber: json['invoiceNumber'] as String?,
    );
  }
}

class StayConnectedStatus {
  const StayConnectedStatus({
    required this.inGrace,
    required this.graceDays,
    this.fee,
    this.graceEndsAt,
    this.sessionName,
  });

  final StayConnectedFee? fee;
  final bool inGrace;
  final int graceDays;
  final String? graceEndsAt;
  final String? sessionName;

  factory StayConnectedStatus.fromJson(Map<String, dynamic> json) {
    return StayConnectedStatus(
      fee: json['fee'] is Map<String, dynamic>
          ? StayConnectedFee.fromJson(json['fee'] as Map<String, dynamic>)
          : null,
      inGrace: json['inGrace'] as bool? ?? false,
      graceDays: json['graceDays'] as int? ?? 0,
      graceEndsAt: json['graceEndsAt'] as String?,
      sessionName: json['sessionName'] as String?,
    );
  }
}

class ManualActivateResult {
  const ManualActivateResult({
    required this.activated,
    required this.skipped,
    required this.billedAmountPaise,
  });

  final List<String> activated;
  final List<String> skipped;
  final int billedAmountPaise;

  factory ManualActivateResult.fromJson(Map<String, dynamic> json) {
    return ManualActivateResult(
      activated: (json['activated'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      skipped: (json['skipped'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      billedAmountPaise: json['billedAmountPaise'] as int? ?? 0,
    );
  }
}
