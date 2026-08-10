---
"@cora/lib": minor
---

Expansion of @cora/lib with core geometric and event utilities. Adds Vec3 3D vector math (vec3 constructor and operations: add, sub, scale, dot, cross, length, distance, normalize, lerp, equalsApprox), Zone containment system (spheres, axis-aligned boxes, extruded polygons with isInside and distanceToCenter queries), TypedEmitter for strictly-typed event dispatch with once listeners and error aggregation, and createLocale for flat-key i18n with parameter interpolation and fallback resolution. All pure functions, zero runtime dependencies.
