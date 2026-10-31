// three.js r128 ships no type declarations and @types/three is not a dependency. The 3D view keeps its use of
// the library inside one module and works through the narrow interfaces declared there.
declare module "three";
