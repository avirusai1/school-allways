class FeesOverview {
  const FeesOverview({
    required this.outstandingPaise,
    required this.invoices,
  });

  final int outstandingPaise;
  final List<FeeInvoice> invoices;

  factory FeesOverview.fromJson(Map<String, dynamic> json) {
    return FeesOverview(
      outstandingPaise: json['outstandingPaise'] as int? ?? 0,
      invoices: (json['invoices'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(FeeInvoice.fromJson)
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'outstandingPaise': outstandingPaise,
        'invoices': invoices.map((e) => e.toJson()).toList(),
      };

  List<FeeInvoice> get payable =>
      invoices.where((i) => i.status != InvoiceStatus.paid).toList();
}

enum InvoiceStatus { paid, due, overdue, partial }

class FeeInvoice {
  const FeeInvoice({
    required this.id,
    required this.termName,
    required this.dueLabel,
    required this.amountPaise,
    required this.status,
  });

  final String id;
  final String termName;
  final String dueLabel;
  final int amountPaise;
  final InvoiceStatus status;

  factory FeeInvoice.fromJson(Map<String, dynamic> json) {
    final s = json['status'] as String? ?? 'due';
    return FeeInvoice(
      id: json['id'] as String,
      termName: json['termName'] as String,
      dueLabel: json['dueLabel'] as String? ?? '',
      amountPaise: json['amountPaise'] as int? ?? 0,
      status: switch (s) {
        'paid' => InvoiceStatus.paid,
        'overdue' => InvoiceStatus.overdue,
        'partial' => InvoiceStatus.partial,
        _ => InvoiceStatus.due,
      },
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'termName': termName,
        'dueLabel': dueLabel,
        'amountPaise': amountPaise,
        'status': status.name,
      };
}

class FeeInvoiceLine {
  const FeeInvoiceLine({
    required this.description,
    required this.amountPaise,
    this.isConcession = false,
  });

  final String description;
  final int amountPaise;
  final bool isConcession;

  factory FeeInvoiceLine.fromJson(Map<String, dynamic> json) {
    final net = json['netAmountPaise'] as int? ?? 0;
    return FeeInvoiceLine(
      description: json['description'] as String? ?? '',
      amountPaise: net,
      isConcession: false,
    );
  }

  factory FeeInvoiceLine.concession(Map<String, dynamic> json) {
    final concession = json['concessionAmountPaise'] as int? ?? 0;
    if (concession <= 0) {
      return const FeeInvoiceLine(description: '', amountPaise: 0);
    }
    return FeeInvoiceLine(
      description: 'Concession · ${json['description'] as String? ?? ''}',
      amountPaise: -concession,
      isConcession: true,
    );
  }
}

class FeeInvoiceDetail {
  const FeeInvoiceDetail({
    required this.id,
    required this.invoiceNo,
    required this.status,
    required this.balancePaise,
    required this.netAmountPaise,
    required this.lines,
    this.dueDate,
  });

  final String id;
  final String invoiceNo;
  final String status;
  final int balancePaise;
  final int netAmountPaise;
  final String? dueDate;
  final List<FeeInvoiceLine> lines;

  factory FeeInvoiceDetail.fromJson(Map<String, dynamic> json) {
    final rawLines = (json['lines'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final lines = <FeeInvoiceLine>[];
    for (final l in rawLines) {
      lines.add(FeeInvoiceLine.fromJson(l));
      final c = FeeInvoiceLine.concession(l);
      if (c.amountPaise < 0) lines.add(c);
    }
    return FeeInvoiceDetail(
      id: json['id'] as String? ?? '',
      invoiceNo: json['invoiceNo'] as String? ?? '',
      status: json['status'] as String? ?? '',
      balancePaise: json['balancePaise'] as int? ?? 0,
      netAmountPaise: json['netAmountPaise'] as int? ?? 0,
      dueDate: json['dueDate'] as String?,
      lines: lines,
    );
  }
}

class PaymentInitiation {
  const PaymentInitiation({
    required this.paymentId,
    required this.amountPaise,
    required this.status,
    this.checkoutUrl,
    this.gatewayOrderId,
  });

  final String paymentId;
  final int amountPaise;
  final String status;
  final String? checkoutUrl;
  final String? gatewayOrderId;

  factory PaymentInitiation.fromJson(Map<String, dynamic> json) {
    return PaymentInitiation(
      paymentId: json['paymentId'] as String? ?? '',
      amountPaise: json['amountPaise'] as int? ?? 0,
      status: json['status'] as String? ?? 'initiated',
      checkoutUrl: json['checkoutUrl'] as String?,
      gatewayOrderId: json['gatewayOrderId'] as String?,
    );
  }
}

class PaymentStatus {
  const PaymentStatus({
    required this.id,
    required this.status,
    required this.amountPaise,
    this.receiptNo,
  });

  final String id;
  final String status;
  final int amountPaise;
  final String? receiptNo;

  bool get isTerminal => status == 'success' || status == 'failed';
  bool get isSuccess => status == 'success';

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
      amountPaise: json['amountPaise'] as int? ?? 0,
      receiptNo: json['receiptNo'] as String?,
    );
  }
}
