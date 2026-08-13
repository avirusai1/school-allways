/// Money is always integer paise. ₹1,250.50 = 125050. Never float.
extension type const MoneyPaise(int paise) implements int {
  double get asRupees => paise / 100.0;

  static MoneyPaise fromRupees(num rupees) =>
      MoneyPaise((rupees * 100).round());
}
