class StudentDto {
  const StudentDto({
    required this.id,
    required this.tenantId,
    required this.fullName,
    this.rollNumber,
    this.sectionId,
    this.photoUrl,
    required this.rowVersion,
  });

  final String id;
  final String tenantId;
  final String fullName;
  final String? rollNumber;
  final String? sectionId;
  final String? photoUrl;
  final int rowVersion;

  factory StudentDto.fromJson(Map<String, dynamic> json) {
    return StudentDto(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      fullName: json['fullName'] as String,
      rollNumber: json['rollNumber'] as String?,
      sectionId: json['sectionId'] as String?,
      photoUrl: json['photoUrl'] as String?,
      rowVersion: json['rowVersion'] as int,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'tenantId': tenantId,
        'fullName': fullName,
        'rollNumber': rollNumber,
        'sectionId': sectionId,
        'photoUrl': photoUrl,
        'rowVersion': rowVersion,
      };
}
