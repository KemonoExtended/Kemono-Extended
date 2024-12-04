function createProxy(obj) {
      return new Proxy(obj, {
            get(target, prop, receiver) {
                  const value = Reflect.get(target, prop, receiver);
                  // If the value is an object, wrap it in a Proxy
                  if (typeof value === "object" && value !== null) {
                        return createProxy(value);
                  }
                  return value;
            },
            set(target, prop, value, receiver) {
                  console.log(`Property ${String(prop)} changed from ${target[prop]} to ${value}`);
                  return Reflect.set(target, prop, value, receiver); // Apply the change
            },
      });
}

// Example usage
const obj = {
      a: {
            b: {
                  c: 42,
            },
      },
};

const proxy = createProxy(obj);

// Changes in the top-level object
proxy.a = { newProp: 123 }; // Logs: Property a changed from [object Object] to [object Object]

// Changes in nested objects
proxy.a.newProp = 456; // Logs: Property newProp changed from 123 to 456
