module.exports = {
  id: '002_transaction_reversal_lookup',
  description: 'Index transaction reversal source references for incremental mirror repair',
  statements: [
    `CREATE INDEX IF NOT EXISTS ix_wallet_transactions_reversal_mongo_id
      ON wallet_transactions (reversal_of_mongo_id)`,
  ],
};
