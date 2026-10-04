/** Shared filter vocabularies — mirrors the CHECK constraints in the API models. */

export const ROBOTS = ["arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01"] as const;

export const ROBOT_OPTIONS = [
  { value: "", label: "Any robot" },
  ...ROBOTS.map((r) => ({ value: r, label: r })),
];

export const QUALITY_OPTIONS = [
  { value: "", label: "Any quality" },
  { value: "good", label: "good" },
  { value: "usable", label: "usable" },
  { value: "bad", label: "bad" },
];

export const ROLE_OPTIONS = [
  { value: "", label: "Any role" },
  { value: "admin", label: "admin" },
  { value: "operator", label: "operator" },
  { value: "client", label: "client" },
];

export const REQUEST_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "submitted" },
  { value: "in_progress", label: "in progress" },
  { value: "delivered", label: "delivered" },
  { value: "accepted", label: "accepted" },
  { value: "rejected", label: "rejected" },
];
