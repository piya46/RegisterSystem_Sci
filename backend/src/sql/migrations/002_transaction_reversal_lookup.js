module.exports = {
  id: '002_transaction_reversal_lookup',
  description: 'Index transaction reversal source references for incremental mirror repair',
  statements: [
    `ALTER TABLE wallet_transactions
      ADD KEY ix_wallet_transactions_reversal_mongo_id (reversal_of_mongo_id)`,
  ],
};
