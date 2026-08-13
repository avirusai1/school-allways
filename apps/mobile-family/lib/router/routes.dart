/// Route path constants for the family app.
abstract final class Routes {
  static const splash = '/';
  static const login = '/login';
  static const otp = '/login/otp';
  static const selectSchool = '/select-school';

  static const home = '/home';
  static const attendance = '/attendance';
  static const homework = '/homework';
  static String homeworkDetail(String id) => '/homework/$id';
  static const diary = '/diary';
  static const fees = '/fees';
  static String invoiceDetail(String id) => '/fees/invoices/$id';
  static String paymentCheckout(String id) => '/fees/pay/$id';
  static const books = '/books';
  static const results = '/results';
  static const bus = '/bus';
  static const more = '/more';
  static const settings = '/settings';

  static const notices = '/notices';
  static String noticeDetail(String id) => '/notices/$id';
  static const messages = '/messages';
  static String messageThread(String id) => '/messages/$id';
  static const privacy = '/privacy';
}
