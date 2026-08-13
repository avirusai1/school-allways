import 'package:core_push/core_push.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../router/app_router.dart';
import 'child_switcher_provider.dart';
import 'providers.dart';

Future<void> handleFamilyPushTap(WidgetRef ref, PushTapTarget target) async {
  final studentId = target.studentId;
  if (studentId != null) {
    await ref.read(childSwitcherProvider.notifier).select(studentId);
  }
  ref.read(routerProvider).go(target.route);
}

void showFamilyForegroundPush(WidgetRef ref, PushForegroundMessage message) {
  final text = message.body ?? message.title;
  if (text == null || text.isEmpty) return;
  ref.read(scaffoldMessengerKeyProvider).currentState?.showSnackBar(
        SnackBar(
          content: Text(text),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () {
              handleFamilyPushTap(ref, message.target);
            },
          ),
        ),
      );
}
