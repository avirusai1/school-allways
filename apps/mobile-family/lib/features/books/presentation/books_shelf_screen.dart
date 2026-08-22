import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../application/books_provider.dart';
import '../domain/book_shelf_item.dart';
import '../../paywall/presentation/paywall_panel.dart';

/// Dense grid shelf — download-once, open-from-disk (sync check is version/hash only).
class BooksShelfScreen extends ConsumerWidget {
  const BooksShelfScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(booksShelfProvider);
    final t = context.tokens;

    return Column(
      children: [
        const SawAppBar(title: 'Books'),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 6, rowHeight: 72),
            ),
            error: (e, _) => GatedPaywallOrError(
              error: e,
              fallbackMessage: 'Could not load books.',
              onRetry: () => ref.invalidate(booksShelfProvider),
            ),
            data: (books) {
              if (books.isEmpty) {
                return EmptyState(
                  icon: PhosphorIconsRegular.bookOpen,
                  headline: 'No books yet',
                  body:
                      'When your school publishes textbooks for this class, they appear here for offline reading.',
                );
              }
              return RefreshIndicator(
                color: t.primary,
                onRefresh: () async => ref.invalidate(booksShelfProvider),
                child: GridView.builder(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: AppSpacing.s3,
                    crossAxisSpacing: AppSpacing.s3,
                    childAspectRatio: 0.62,
                  ),
                  itemCount: books.length,
                  itemBuilder: (context, i) => _BookTile(book: books[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _BookTile extends StatelessWidget {
  const _BookTile({required this.book});

  final BookShelfItem book;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: t.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(
              PhosphorIconsRegular.book,
              size: 36,
              color: t.textTertiary,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.s1),
        Text(
          book.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.caption(color: t.textPrimary),
        ),
        if (book.author != null)
          Text(
            book.author!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.caption(color: t.textTertiary),
          ),
      ],
    );
  }
}
