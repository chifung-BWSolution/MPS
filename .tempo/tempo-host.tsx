/* THIS FILE IS AUTO-GENERATED. DO NOT EDIT. */
import { lazy, Suspense, useEffect } from "react";

const registryReloadEvent = "__tempo:reload-component-registry__";
let registryReloadVersion = 0;

const registryPreload = import("./component-registry");
const reloadRegistry = () =>
  import(`./component-registry?tempo-registry=${++registryReloadVersion}`);

const Host = lazy(async () => {
  const mod = await import("./component-host");
  await registryPreload;
  return mod;
});

export default function TempoHost() {
  useEffect(() => {
    const handleRegistryReload = () => {
      void reloadRegistry();
    };

    window.addEventListener(registryReloadEvent, handleRegistryReload);
    return () => {
      window.removeEventListener(registryReloadEvent, handleRegistryReload);
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
