// The OCSF subset this prototype targets (assumption A-3). Fields a mapping may write, and the constants the
// normalize stage adds. Arrays (e.g. attacks[]) are out of scope for v0.
import type { Json, OcsfTarget } from "./types";

export interface OcsfClass {
  title: string;
  fields: string[];
  constants: Record<string, Json>;
}

export const OCSF: Record<OcsfTarget, OcsfClass> = {
  "ocsf.detection_finding": {
    title: "OCSF Detection Finding (2004)",
    fields: [
      "finding_info.uid",
      "finding_info.title",
      "severity_id",
      "time",
      "device.hostname",
      "device.ip",
      "actor.user.name",
      "actor.user.email",
      "metadata.product.vendor_name",
    ],
    constants: { class_uid: 2004, category_uid: 2, activity_id: 1, type_uid: 200401, "metadata.version": "1.3.0" },
  },
  "ocsf.authentication": {
    title: "OCSF Authentication (3002)",
    fields: ["metadata.uid", "status_id", "user.name", "user.email_addr", "src_endpoint.ip", "time", "metadata.product.vendor_name"],
    constants: { class_uid: 3002, category_uid: 3, activity_id: 1, type_uid: 300201, "metadata.version": "1.3.0" },
  },
};
