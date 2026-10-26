/**
 * The bundled Firestore index spec (generated from firestore.indexes.json).
 * The index doors use it to prove a requested index is one the app actually
 * declares before creating it. Regenerate this file whenever the JSON changes.
 */
export interface IndexSpecEntry {
  collectionGroup: string;
  queryScope: string;
  fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>;
}

export const INDEX_SPEC: IndexSpecEntry[] = [
  {"collectionGroup":"mockAttempts","queryScope":"COLLECTION","fields":[{"fieldPath":"mockId","order":"ASCENDING"},{"fieldPath":"scoreCorrect","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"difficulty","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"klass","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"examType","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"subjectKey","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"topicKey","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"batchId","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"subject","order":"ASCENDING"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"year","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"tokens","arrayConfig":"CONTAINS_ANY"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"qbQuestions","queryScope":"COLLECTION","fields":[{"fieldPath":"kind","order":"ASCENDING"},{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"tokens","arrayConfig":"CONTAINS_ANY"},{"fieldPath":"updatedAt","order":"DESCENDING"}]},
  {"collectionGroup":"mocks","queryScope":"COLLECTION","fields":[{"fieldPath":"status","order":"ASCENDING"},{"fieldPath":"date","order":"ASCENDING"}]},
  {"collectionGroup":"mockAttempts","queryScope":"COLLECTION","fields":[{"fieldPath":"uid","order":"ASCENDING"},{"fieldPath":"startedAt","order":"DESCENDING"}]},
];
