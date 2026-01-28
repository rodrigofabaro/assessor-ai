export type Student = {
  id: string;
  fullName: string;
  externalRef?: string | null;
  email?: string | null;
};

export type Assignment = {
  id: string;
  unitCode: string;
  title: string;
  assignmentRef?: string | null;
};

export type PicklistsResponse<T> = T[] | { students?: T[] } | { assignments?: T[] };
