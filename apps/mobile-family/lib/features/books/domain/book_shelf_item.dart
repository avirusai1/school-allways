class BookShelfItem {
  const BookShelfItem({
    required this.id,
    required this.title,
    this.author,
    this.coverPath,
    this.source = 'school_upload',
  });

  final String id;
  final String title;
  final String? author;
  final String? coverPath;
  final String source;

  factory BookShelfItem.fromJson(Map<String, dynamic> json) {
    return BookShelfItem(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Untitled',
      author: json['author'] as String?,
      coverPath: json['coverPath'] as String?,
      source: json['source'] as String? ?? 'school_upload',
    );
  }
}
