// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { mono_assert } from "./types";
import { NativePointer, ManagedPointer, VoidPtr } from "./types/emscripten";
import { Module } from "./imports";
import { WasmOpcode } from "./jiterpreter-opcodes";
import cwraps from "./cwraps";

export const maxFailures = 2,
    maxMemsetSize = 64,
    maxMemmoveSize = 64,
    shortNameBase = 36;

// uint16
export declare interface MintOpcodePtr extends NativePointer {
    __brand: "MintOpcodePtr"
}

type FunctionType = [
    index: FunctionTypeIndex,
    parameters: { [name: string]: WasmValtype },
    returnType: WasmValtype,
    signature: string
];

type FunctionTypeIndex = number;

type FunctionTypeByIndex = [
    parameters: { [name: string]: WasmValtype },
    returnType: WasmValtype,
];

type FunctionInfo = {
    index: number;
    name: string;
    typeName: string;
    typeIndex: number;
    locals: { [name: string]: WasmValtype };
    export: boolean;
    generator: Function;
    error: Error | null;
    blob: Uint8Array | null;
}

type ImportedFunctionInfo = {
    index?: number;
    typeIndex: number;
    module: string;
    name: string;
    friendlyName: string;
}

export class WasmBuilder {
    stack: Array<BlobBuilder>;
    stackSize!: number;
    inSection!: boolean;
    inFunction!: boolean;
    allowNullCheckOptimization!: boolean;
    locals = new Map<string, [WasmValtype, number]>();

    permanentFunctionTypeCount = 0;
    permanentFunctionTypes: { [name: string] : FunctionType } = {};
    permanentFunctionTypesByShape: { [shape: string] : FunctionTypeIndex } = {};
    permanentFunctionTypesByIndex: { [index: number] : FunctionTypeByIndex } = {};

    functionTypeCount!: number;
    functionTypes!: { [name: string] : FunctionType };
    functionTypesByShape!: { [shape: string] : FunctionTypeIndex };
    functionTypesByIndex: { [index: number] : FunctionTypeByIndex } = {};

    importedFunctionCount!: number;
    importedFunctions!: { [name: string] : ImportedFunctionInfo };
    nextImportIndex = 0;

    functions: Array<FunctionInfo> = [];
    estimatedExportBytes = 0;

    argumentCount!: number;
    activeBlocks!: number;
    base!: MintOpcodePtr;
    traceBuf: Array<string> = [];
    branchTargets = new Set<MintOpcodePtr>();
    options!: JiterpreterOptions;
    constantSlots: Array<number> = [];
    backBranchOffsets: Array<MintOpcodePtr> = [];
    nextConstantSlot = 0;

    constructor (constantSlotCount: number) {
        this.stack = [new BlobBuilder()];
        this.clear(constantSlotCount);
    }

    clear (constantSlotCount: number) {
        this.options = getOptions();
        this.stackSize = 1;
        this.inSection = false;
        this.inFunction = false;
        this.locals.clear();

        this.functionTypeCount = this.permanentFunctionTypeCount;
        this.functionTypes = Object.create(this.permanentFunctionTypes);
        this.functionTypesByShape = Object.create(this.permanentFunctionTypesByShape);
        this.functionTypesByIndex = Object.create(this.permanentFunctionTypesByIndex);

        this.nextImportIndex = 0;
        this.importedFunctionCount = 0;
        this.importedFunctions = {};

        this.functions.length = 0;
        this.estimatedExportBytes = 0;

        this.argumentCount = 0;
        this.current.clear();
        this.traceBuf.length = 0;
        this.branchTargets.clear();
        this.activeBlocks = 0;
        this.nextConstantSlot = 0;
        this.constantSlots.length = this.options.useConstants ? constantSlotCount : 0;
        for (let i = 0; i < this.constantSlots.length; i++)
            this.constantSlots[i] = 0;
        this.backBranchOffsets.length = 0;

        this.allowNullCheckOptimization = this.options.eliminateNullChecks;
    }

    _push () {
        this.stackSize++;
        if (this.stackSize >= this.stack.length)
            this.stack.push(new BlobBuilder());
        this.current.clear();
    }

    _pop (writeToOutput: boolean) {
        if (this.stackSize <= 1)
            throw new Error("Stack empty");

        const current = this.current;
        this.stackSize--;

        const av = current.getArrayView();
        if (writeToOutput) {
            this.appendULeb(current.size);
            this.appendBytes(av);
            return null;
        } else
            return av.slice();
    }

    // HACK: Approximate amount of space we need to generate the full module at present
    // FIXME: This does not take into account any other functions already generated if they weren't
    //  emitted into the module immediately
    get bytesGeneratedSoFar () {
        return this.stack[0].size +
            // HACK: A random constant for section headers and padding
            32 +
            // mod (2 bytes) name (2-3 bytes) type (1 byte) typeidx (1-2 bytes)
            (this.importedFunctionCount * 8) +
            // type index for each function
            (this.functions.length * 2) +
            // export entry for each export
            this.estimatedExportBytes;
    }

    get current() {
        return this.stack[this.stackSize - 1];
    }

    get size() {
        return this.current.size;
    }

    appendU8 (value: number | WasmOpcode) {
        if ((value != value >>> 0) || (value > 255))
            throw new Error(`Byte out of range: ${value}`);
        return this.current.appendU8(value);
    }

    appendU32 (value: number) {
        return this.current.appendU32(value);
    }

    appendF32 (value: number) {
        return this.current.appendF32(value);
    }

    appendF64 (value: number) {
        return this.current.appendF64(value);
    }

    appendBoundaryValue (bits: number, sign: number) {
        return this.current.appendBoundaryValue(bits, sign);
    }

    appendULeb (value: number | MintOpcodePtr) {
        return this.current.appendULeb(<any>value);
    }

    appendLeb (value: number) {
        return this.current.appendLeb(value);
    }

    appendLebRef (sourceAddress: VoidPtr, signed: boolean) {
        return this.current.appendLebRef(sourceAddress, signed);
    }

    appendBytes (bytes: Uint8Array) {
        return this.current.appendBytes(bytes);
    }

    appendName (text: string) {
        return this.current.appendName(text);
    }

    ret (ip: MintOpcodePtr) {
        this.ip_const(ip);
        this.appendU8(WasmOpcode.return_);
    }

    i32_const (value: number | ManagedPointer | NativePointer) {
        this.appendU8(WasmOpcode.i32_const);
        this.appendLeb(<any>value);
    }

    ptr_const (pointer: number | ManagedPointer | NativePointer) {
        let idx = this.options.useConstants ? this.constantSlots.indexOf(<any>pointer) : -1;
        if (
            this.options.useConstants &&
            (idx < 0) && (this.nextConstantSlot < this.constantSlots.length)
        ) {
            idx = this.nextConstantSlot++;
            this.constantSlots[idx] = <any>pointer;
        }

        if (idx >= 0) {
            this.appendU8(WasmOpcode.get_global);
            this.appendLeb(idx);
        } else {
            // console.log(`Warning: no constant slot for ${pointer} (${this.nextConstantSlot} slots used)`);
            this.i32_const(pointer);
        }
    }

    ip_const (value: MintOpcodePtr) {
        this.appendU8(WasmOpcode.i32_const);
        this.appendLeb(<any>value - <any>this.base);
    }

    i52_const (value: number) {
        this.appendU8(WasmOpcode.i64_const);
        this.appendLeb(value);
    }

    defineType (
        name: string, parameters: { [name: string]: WasmValtype }, returnType: WasmValtype,
        permanent: boolean
    ) {
        if (this.functionTypes[name])
            throw new Error(`Function type ${name} already defined`);
        if (permanent && (this.functionTypeCount > this.permanentFunctionTypeCount))
            throw new Error("New permanent function types cannot be defined after non-permanent ones");

        let shape = "";
        for (const k in parameters)
            shape += parameters[k] + ",";
        shape += returnType;

        let index = this.functionTypesByShape[shape];

        if (typeof (index) !== "number") {
            index = this.functionTypeCount++;

            if (permanent) {
                this.permanentFunctionTypeCount++;
                this.permanentFunctionTypesByShape[shape] = index;
                this.permanentFunctionTypesByIndex[index] = [parameters, returnType];
            } else {
                this.functionTypesByShape[shape] = index;
                this.functionTypesByIndex[index] = [parameters, returnType];
            }
        }

        const tup : FunctionType = [
            index, parameters, returnType, `(${JSON.stringify(parameters)}) -> ${returnType}`
        ];
        if (permanent)
            this.permanentFunctionTypes[name] = tup;
        else
            this.functionTypes[name] = tup;

        return index;
    }

    generateTypeSection () {
        this.beginSection(1);
        this.appendULeb(this.functionTypeCount);
        /*
        if (trace > 1)
            console.log(`Generated ${this.functionTypeCount} wasm type(s) from ${Object.keys(this.functionTypes).length} named function types`);
        */
        for (let i = 0; i < this.functionTypeCount; i++) {
            const parameters = this.functionTypesByIndex[i][0];
            const returnType = this.functionTypesByIndex[i][1];
            this.appendU8(0x60);
            // Parameters
            this.appendULeb(Object.keys(parameters).length);
            for (const k in parameters)
                this.appendU8(parameters[k]);
            // Return type(s)
            if (returnType !== WasmValtype.void) {
                this.appendULeb(1);
                this.appendU8(returnType);
            } else
                this.appendULeb(0);
        }
        this.endSection();
    }

    _generateImportSection () {
        const allImports = Object.values(this.importedFunctions);
        const importsToEmit = allImports.filter(f => f.index !== undefined);
        importsToEmit.sort((lhs, rhs) => lhs.index! - rhs.index!);

        // Import section
        this.beginSection(2);
        this.appendULeb(1 + importsToEmit.length + this.constantSlots.length);

        // console.log(`referenced ${importsToEmit.length}/${allImports.length} import(s)`);
        for (let i = 0; i < importsToEmit.length; i++) {
            const ifi = importsToEmit[i];
            // console.log(`  #${ifi.index} ${ifi.module}.${ifi.name} = ${ifi.friendlyName}`);
            this.appendName(ifi.module);
            this.appendName(ifi.name);
            this.appendU8(0x0); // function
            this.appendU8(ifi.typeIndex);
        }

        for (let i = 0; i < this.constantSlots.length; i++) {
            this.appendName("c");
            this.appendName(i.toString(shortNameBase));
            this.appendU8(0x03); // global
            this.appendU8(WasmValtype.i32); // all constants are pointers right now
            this.appendU8(0x00); // constant
        }

        this.appendName("m");
        this.appendName("h");
        // memtype (limits = { min=0x01, max=infinity })
        this.appendU8(0x02);
        this.appendU8(0x00);
        // Minimum size is in 64k pages, not bytes
        this.appendULeb(0x01);
    }

    defineImportedFunction (
        module: string, name: string, functionTypeName: string,
        assumeUsed: boolean, wasmName?: string
    ) : ImportedFunctionInfo {
        const type = this.functionTypes[functionTypeName];
        if (!type)
            throw new Error("No function type named " + functionTypeName);
        const typeIndex = type[0];
        const result = this.importedFunctions[name] = {
            index: assumeUsed ? this.importedFunctionCount++ : undefined,
            typeIndex,
            module,
            name: wasmName || name,
            friendlyName: name,
        };
        return result;
    }

    defineFunction (
        options: {
            type: string,
            name: string,
            export: boolean,
            locals: { [name: string]: WasmValtype }
        }, generator: Function
    ) {
        const rec : FunctionInfo = {
            index: this.functions.length,
            name: options.name,
            typeName: options.type,
            typeIndex: this.functionTypes[options.type][0],
            export: options.export,
            locals: options.locals,
            generator,
            error: null,
            blob: null
        };
        this.functions.push(rec);
        if (rec.export)
            this.estimatedExportBytes += rec.name.length + 8;
        return rec;
    }

    emitImportsAndFunctions () {
        let exportCount = 0;
        for (let i = 0; i < this.functions.length; i++) {
            const func = this.functions[i];
            if (func.export)
                exportCount++;

            this.beginFunction(func.typeName, func.locals);
            try {
                func.generator();
            /*
            } catch (exc) {
                func.error = <any>exc;
            */
            } finally {
                func.blob = this.endFunction(false);
            }
        }

        this._generateImportSection();

        // Function section
        this.beginSection(3);
        this.appendULeb(this.functions.length);
        for (let i = 0; i < this.functions.length; i++)
            this.appendULeb(this.functions[i].typeIndex);

        // Export section
        this.beginSection(7);
        this.appendULeb(exportCount);
        for (let i = 0; i < this.functions.length; i++) {
            const func = this.functions[i];
            if (!func.export)
                continue;
            this.appendName(func.name);
            this.appendU8(0); // func export
            this.appendULeb(this.importedFunctionCount + i);
        }

        // Code section
        this.beginSection(10);
        this.appendULeb(this.functions.length);
        for (let i = 0; i < this.functions.length; i++) {
            const func = this.functions[i];
            mono_assert(func.blob, () => `expected function ${func.name} to have a body`);
            this.appendULeb(func.blob.length);
            this.appendBytes(func.blob);
        }
        this.endSection();
    }

    callImport (name: string) {
        const func = this.importedFunctions[name];
        if (!func)
            throw new Error("No imported function named " + name);
        if (func.index === undefined)
            func.index = this.importedFunctionCount++;
        this.appendU8(WasmOpcode.call);
        this.appendULeb(func.index);
    }

    beginSection (type: number) {
        if (this.inSection)
            this._pop(true);
        this.appendU8(type);
        this._push();
        this.inSection = true;
    }

    endSection () {
        if (!this.inSection)
            throw new Error("Not in section");
        if (this.inFunction)
            this.endFunction(true);
        this._pop(true);
        this.inSection = false;
    }

    beginFunction (
        type: string,
        locals?: {[name: string]: WasmValtype}
    ) {
        if (this.inFunction)
            throw new Error("Already in function");
        this._push();

        const signature = this.functionTypes[type];
        this.locals.clear();
        this.branchTargets.clear();
        let counts: any = {};
        const tk = [WasmValtype.i32, WasmValtype.i64, WasmValtype.f32, WasmValtype.f64];

        const assignParameterIndices = (parms: {[name: string] : WasmValtype}) => {
            let result = 0;
            for (const k in parms) {
                const parm = parms[k];
                this.locals.set(k, [parm, result]);
                // console.log(`parm ${k} -> ${result}`);
                result++;
            }
            return result;
        };

        let localGroupCount = 0;

        // We first assign the parameters local indices and then
        //  we assign the named locals indices, because parameters
        //  come first in the local space. Imagine if parameters
        //  had their own opcode and weren't mutable??????
        const assignLocalIndices = (locals: {[name: string] : WasmValtype}, base: number) => {
            Object.assign(counts, {
                [WasmValtype.i32]: 0,
                [WasmValtype.i64]: 0,
                [WasmValtype.f32]: 0,
                [WasmValtype.f64]: 0,
            });
            for (const k in locals) {
                const ty = locals[k];
                if (counts[ty] <= 0)
                    localGroupCount++;
                counts[ty]++;
            }

            const offi32 = 0,
                offi64 = counts[WasmValtype.i32],
                offf32 = offi64 + counts[WasmValtype.i64],
                offf64 = offf32 + counts[WasmValtype.f32];
            Object.assign(counts,{
                [WasmValtype.i32]: 0,
                [WasmValtype.i64]: 0,
                [WasmValtype.f32]: 0,
                [WasmValtype.f64]: 0,
            });
            for (const k in locals) {
                const ty = locals[k];
                let idx = 0;
                switch (ty) {
                    case WasmValtype.i32:
                        idx = (counts[ty]++) + offi32 + base;
                        this.locals.set(k, [ty, idx]);
                        break;
                    case WasmValtype.i64:
                        idx = (counts[ty]++) + offi64 + base;
                        this.locals.set(k, [ty, idx]);
                        break;
                    case WasmValtype.f32:
                        idx = (counts[ty]++) + offf32 + base;
                        this.locals.set(k, [ty, idx]);
                        break;
                    case WasmValtype.f64:
                        idx = (counts[ty]++) + offf64 + base;
                        this.locals.set(k, [ty, idx]);
                        break;
                }
                // console.log(`local ${k} ${locals[k]} -> ${idx}`);
            }
        };

        // Assign indices for the parameter list from the function signature
        const localBaseIndex = assignParameterIndices(signature[1]);
        if (locals)
            // Now if we have any locals, assign indices for those
            assignLocalIndices(locals, localBaseIndex);
        else
            // Otherwise erase the counts table from the parameter assignment
            counts = {};

        // Write the number of types and then write a count for each type
        this.appendULeb(localGroupCount);
        for (let i = 0; i < tk.length; i++) {
            const k = tk[i];
            const c = counts[k];
            if (!c)
                continue;
            // console.log(`${k} x${c}`);
            this.appendULeb(c);
            this.appendU8(<any>k);
        }

        this.inFunction = true;
    }

    endFunction (writeToOutput: boolean) {
        if (!this.inFunction)
            throw new Error("Not in function");
        if (this.activeBlocks > 0)
            throw new Error(`${this.activeBlocks} unclosed block(s) at end of function`);
        const result = this._pop(writeToOutput);
        this.inFunction = false;
        return result;
    }

    block (type?: WasmValtype, opcode?: WasmOpcode) {
        const result = this.appendU8(opcode || WasmOpcode.block);
        if (type)
            this.appendU8(type);
        else
            this.appendU8(WasmValtype.void);
        this.activeBlocks++;
        return result;
    }

    endBlock () {
        if (this.activeBlocks <= 0)
            throw new Error("No blocks active");
        this.activeBlocks--;
        this.appendU8(WasmOpcode.end);
    }

    arg (name: string | number, opcode?: WasmOpcode) {
        const index = typeof(name) === "string"
            ? (this.locals.has(name) ? this.locals.get(name)![1] : undefined)
            : name;
        if (typeof (index) !== "number")
            throw new Error("No local named " + name);
        if (opcode)
            this.appendU8(opcode);
        this.appendULeb(index);
    }

    local (name: string | number, opcode?: WasmOpcode) {
        const index = typeof(name) === "string"
            ? (this.locals.has(name) ? this.locals.get(name)![1] : undefined)
            : name + this.argumentCount;
        if (typeof (index) !== "number")
            throw new Error("No local named " + name);
        if (opcode)
            this.appendU8(opcode);
        else
            this.appendU8(WasmOpcode.get_local);
        this.appendULeb(index);
    }

    appendMemarg (offset: number, alignPower: number) {
        this.appendULeb(alignPower);
        this.appendULeb(offset);
    }

    /*
        generates either (u32)get_local(ptr) + offset or (u32)ptr1 + offset
    */
    lea (ptr1: string | number, offset: number) {
        if (typeof (ptr1) === "string")
            this.local(ptr1);
        else
            this.i32_const(ptr1);

        this.i32_const(offset);
        // FIXME: How do we make sure this has correct semantics for pointers over 2gb?
        this.appendU8(WasmOpcode.i32_add);
    }

    getArrayView (fullCapacity?: boolean) {
        if (this.stackSize > 1)
            throw new Error("Jiterpreter block stack not empty");
        return this.stack[0].getArrayView(fullCapacity);
    }

    getConstants () {
        const result : { [key: string]: number } = {};
        for (let i = 0; i < this.constantSlots.length; i++)
            result[i.toString(shortNameBase)] = this.constantSlots[i];
        return result;
    }
}

export class BlobBuilder {
    buffer: number;
    view!: DataView;
    size: number;
    capacity: number;
    encoder?: TextEncoder;
    textBuf = new Uint8Array(1024);

    constructor () {
        this.capacity = 32000;
        this.buffer = <any>Module._malloc(this.capacity);
        this.size = 0;
        this.clear();
        if (typeof (TextEncoder) === "function")
            this.encoder = new TextEncoder();
    }

    // It is necessary for you to call this before using the builder so that the DataView
    //  can be reconstructed in case the heap grew since last use
    clear () {
        // FIXME: This should not be necessary
        Module.HEAPU8.fill(0, this.buffer, this.buffer + this.size);
        this.size = 0;
        this.view = new DataView(Module.HEAPU8.buffer, this.buffer, this.capacity);
    }

    appendU8 (value: number | WasmOpcode) {
        if (this.size >= this.capacity)
            throw new Error("Buffer full");

        const result = this.size;
        Module.HEAPU8[this.buffer + (this.size++)] = value;
        return result;
    }

    appendU16 (value: number) {
        const result = this.size;
        this.view.setUint16(this.size, value, true);
        this.size += 2;
        return result;
    }

    appendI16 (value: number) {
        const result = this.size;
        this.view.setInt16(this.size, value, true);
        this.size += 2;
        return result;
    }

    appendU32 (value: number) {
        const result = this.size;
        this.view.setUint32(this.size, value, true);
        this.size += 4;
        return result;
    }

    appendI32 (value: number) {
        const result = this.size;
        this.view.setInt32(this.size, value, true);
        this.size += 4;
        return result;
    }

    appendF32 (value: number) {
        const result = this.size;
        this.view.setFloat32(this.size, value, true);
        this.size += 4;
        return result;
    }

    appendF64 (value: number) {
        const result = this.size;
        this.view.setFloat64(this.size, value, true);
        this.size += 8;
        return result;
    }

    appendBoundaryValue (bits: number, sign: number) {
        if (this.size + 8 >= this.capacity)
            throw new Error("Buffer full");

        const bytesWritten = cwraps.mono_jiterp_encode_leb_signed_boundary(<any>(this.buffer + this.size), bits, sign);
        if (bytesWritten < 1)
            throw new Error(`Failed to encode ${bits} bit boundary value with sign ${sign}`);
        this.size += bytesWritten;
        return bytesWritten;
    }

    appendULeb (value: number) {
        if (this.size + 8 >= this.capacity)
            throw new Error("Buffer full");

        const bytesWritten = cwraps.mono_jiterp_encode_leb52(<any>(this.buffer + this.size), value, 0);
        if (bytesWritten < 1)
            throw new Error(`Failed to encode value '${value}' as unsigned leb`);
        this.size += bytesWritten;
        return bytesWritten;
    }

    appendLeb (value: number) {
        if (this.size + 8 >= this.capacity)
            throw new Error("Buffer full");

        const bytesWritten = cwraps.mono_jiterp_encode_leb52(<any>(this.buffer + this.size), value, 1);
        if (bytesWritten < 1)
            throw new Error(`Failed to encode value '${value}' as signed leb`);
        this.size += bytesWritten;
        return bytesWritten;
    }

    appendLebRef (sourceAddress: VoidPtr, signed: boolean) {
        if (this.size + 8 >= this.capacity)
            throw new Error("Buffer full");

        const bytesWritten = cwraps.mono_jiterp_encode_leb64_ref(<any>(this.buffer + this.size), sourceAddress, signed ? 1 : 0);
        if (bytesWritten < 1)
            throw new Error("Failed to encode value as leb");
        this.size += bytesWritten;
        return bytesWritten;
    }

    appendBytes (bytes: Uint8Array, count?: number) {
        const result = this.size;
        if (typeof (count) === "number")
            bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, count);
        const av = this.getArrayView(true);
        av.set(bytes, this.size);
        this.size += bytes.length;
        return result;
    }

    appendName (text: string) {
        let count = text.length;
        // TextEncoder overhead is significant for short strings, and lots of our strings
        //  are single-character import names, so add a fast path for single characters
        let singleChar = text.length === 1 ? text.charCodeAt(0) : -1;
        if (singleChar > 0x7F)
            singleChar = -1;

        // Also don't bother running the encode path for empty strings
        if (count && (singleChar < 0)) {
            if (this.encoder) {
                const temp = this.encoder.encodeInto(text, this.textBuf);
                count = temp.written || 0;
            } else {
                for (let i = 0; i < count; i++) {
                    const ch = text.charCodeAt(i);
                    if (ch > 0x7F)
                        throw new Error("Out of range character and no TextEncoder available");
                    else
                        this.textBuf[i] = ch;
                }
            }
        }

        this.appendULeb(count);
        if (singleChar >= 0)
            this.appendU8(singleChar);
        else if (count > 1)
            this.appendBytes(this.textBuf, count);
    }

    getArrayView (fullCapacity?: boolean) {
        return new Uint8Array(Module.HEAPU8.buffer, this.buffer, fullCapacity ? this.capacity : this.size);
    }
}

export const enum WasmValtype {
    void = 0x40,
    i32 = 0x7F,
    i64 = 0x7E,
    f32 = 0x7D,
    f64 = 0x7C,
}

let wasmTable : WebAssembly.Table | undefined;
let wasmNextFunctionIndex = -1, wasmFunctionIndicesFree = 0;

// eslint-disable-next-line prefer-const
export const elapsedTimes = {
    generation: 0,
    compilation: 0
};

export const counters = {
    traceCandidates: 0,
    tracesCompiled: 0,
    entryWrappersCompiled: 0,
    jitCallsCompiled: 0,
    directJitCallsCompiled: 0,
    failures: 0,
    bytesGenerated: 0,
    nullChecksEliminated: 0,
    backBranchesEmitted: 0,
    backBranchesNotEmitted: 0,
};

export const _now = (globalThis.performance && globalThis.performance.now)
    ? globalThis.performance.now.bind(globalThis.performance)
    : Date.now;

let scratchBuffer : NativePointer = <any>0;

export function copyIntoScratchBuffer (src: NativePointer, size: number) : NativePointer {
    if (!scratchBuffer)
        scratchBuffer = Module._malloc(64);
    if (size > 64)
        throw new Error("Scratch buffer size is 64");

    Module.HEAPU8.copyWithin(<any>scratchBuffer, <any>src, <any>src + size);
    return scratchBuffer;
}

export function getWasmFunctionTable () {
    if (!wasmTable)
        wasmTable = (<any>Module)["asm"]["__indirect_function_table"];
    if (!wasmTable)
        throw new Error("Module did not export the indirect function table");
    return wasmTable;
}

export function addWasmFunctionPointer (f: Function) {
    if (!f)
        throw new Error("Attempting to set null function into table");
    const table = getWasmFunctionTable();
    if (wasmFunctionIndicesFree <= 0) {
        wasmNextFunctionIndex = table.length;
        wasmFunctionIndicesFree = 512;
        table.grow(wasmFunctionIndicesFree);
    }
    const index = wasmNextFunctionIndex;
    wasmNextFunctionIndex++;
    wasmFunctionIndicesFree--;
    table.set(index, f);
    return index;
}

export function try_append_memset_fast (builder: WasmBuilder, localOffset: number, value: number, count: number, destOnStack: boolean) {
    if (count <= 0) {
        if (destOnStack)
            builder.appendU8(WasmOpcode.drop);
        return true;
    }

    if (count >= maxMemsetSize)
        return false;

    const destLocal = destOnStack ? "math_lhs32" : "pLocals";
    if (destOnStack)
        builder.local("math_lhs32", WasmOpcode.set_local);

    let offset = destOnStack ? 0 : localOffset;
    // Do blocks of 8-byte sets first for smaller/faster code
    while (count >= 8) {
        builder.local(destLocal);
        builder.i52_const(0);
        builder.appendU8(WasmOpcode.i64_store);
        builder.appendMemarg(offset, 0);
        offset += 8;
        count -= 8;
    }

    // Then set the remaining 0-7 bytes
    while (count >= 1) {
        builder.local(destLocal);
        builder.i32_const(0);
        let localCount = count % 4;
        switch (localCount) {
            case 0:
                // since we did %, 4 bytes turned into 0. gotta fix that up to avoid infinite loop
                localCount = 4;
                builder.appendU8(WasmOpcode.i32_store);
                break;
            case 1:
                builder.appendU8(WasmOpcode.i32_store8);
                break;
            case 3:
            case 2:
                // For 3 bytes we just want to do a 2 write then a 1
                localCount = 2;
                builder.appendU8(WasmOpcode.i32_store16);
                break;
        }
        builder.appendMemarg(offset, 0);
        offset += localCount;
        count -= localCount;
    }

    return true;
}

export function append_memset_dest (builder: WasmBuilder, value: number, count: number) {
    // spec: pop n, pop val, pop d, fill from d[0] to d[n] with value val
    if (try_append_memset_fast(builder, 0, value, count, true))
        return;

    builder.i32_const(value);
    builder.i32_const(count);
    builder.appendU8(WasmOpcode.PREFIX_sat);
    builder.appendU8(11);
    builder.appendU8(0);
}

export function try_append_memmove_fast (
    builder: WasmBuilder, destLocalOffset: number, srcLocalOffset: number,
    count: number, addressesOnStack: boolean
) {
    let destLocal = "math_lhs32", srcLocal = "math_rhs32";

    if (count <= 0) {
        if (addressesOnStack) {
            builder.appendU8(WasmOpcode.drop);
            builder.appendU8(WasmOpcode.drop);
        }
        return true;
    }

    if (count >= maxMemmoveSize)
        return false;

    if (addressesOnStack) {
        builder.local(srcLocal, WasmOpcode.set_local);
        builder.local(destLocal, WasmOpcode.set_local);
    } else {
        destLocal = srcLocal = "pLocals";
    }

    let destOffset = addressesOnStack ? 0 : destLocalOffset,
        srcOffset = addressesOnStack ? 0 : srcLocalOffset;

    // Do blocks of 8-byte copies first for smaller/faster code
    while (count >= 8) {
        builder.local(destLocal);
        builder.local(srcLocal);
        builder.appendU8(WasmOpcode.i64_load);
        builder.appendMemarg(srcOffset, 0);
        builder.appendU8(WasmOpcode.i64_store);
        builder.appendMemarg(destOffset, 0);
        destOffset += 8;
        srcOffset += 8;
        count -= 8;
    }

    // Then copy the remaining 0-7 bytes
    while (count >= 1) {
        let loadOp : WasmOpcode, storeOp : WasmOpcode;
        let localCount = count % 4;
        switch (localCount) {
            case 0:
                // since we did %, 4 bytes turned into 0. gotta fix that up to avoid infinite loop
                localCount = 4;
                loadOp = WasmOpcode.i32_load;
                storeOp = WasmOpcode.i32_store;
                break;
            default:
            case 1:
                localCount = 1; // silence tsc
                loadOp = WasmOpcode.i32_load8_s;
                storeOp = WasmOpcode.i32_store8;
                break;
            case 3:
            case 2:
                // For 3 bytes we just want to do a 2 write then a 1
                localCount = 2;
                loadOp = WasmOpcode.i32_load16_s;
                storeOp = WasmOpcode.i32_store16;
                break;

        }

        builder.local(destLocal);
        builder.local(srcLocal);
        builder.appendU8(loadOp);
        builder.appendMemarg(srcOffset, 0);
        builder.appendU8(storeOp);
        builder.appendMemarg(destOffset, 0);
        srcOffset += localCount;
        destOffset += localCount;
        count -= localCount;
    }

    return true;
}

// expects dest then source to have been pushed onto wasm stack
export function append_memmove_dest_src (builder: WasmBuilder, count: number) {
    if (try_append_memmove_fast(builder, 0, 0, count, true))
        return true;

    // spec: pop n, pop s, pop d, copy n bytes from s to d
    builder.i32_const(count);
    // great encoding isn't it
    builder.appendU8(WasmOpcode.PREFIX_sat);
    builder.appendU8(10);
    builder.appendU8(0);
    builder.appendU8(0);
    return true;
}

export function recordFailure () : void {
    counters.failures++;
    if (counters.failures >= maxFailures) {
        console.log(`MONO_WASM: Disabling jiterpreter after ${counters.failures} failures`);
        applyOptions(<any>{
            enableTraces: false,
            enableInterpEntry: false,
            enableJitCall: false
        });
    }
}

export const enum JiterpMember {
    VtableInitialized = 0,
    ArrayData = 1,
    StringLength = 2,
    StringData = 3,
    Imethod = 4,
    DataItems = 5,
    Rmethod = 6,
    SpanLength = 7,
    SpanData = 8,
    ArrayLength = 9,
    BackwardBranchOffsets = 10,
    BackwardBranchOffsetsCount = 11,
}

const memberOffsets : { [index: number] : number } = {};

export function getMemberOffset (member: JiterpMember) {
    const cached = memberOffsets[member];
    if (cached === undefined)
        return memberOffsets[member] = cwraps.mono_jiterp_get_member_offset(<any>member);
    else
        return cached;
}

export function getRawCwrap (name: string): Function {
    const result = (<any>Module)["asm"][name];
    if (typeof (result) !== "function")
        throw new Error(`raw cwrap ${name} not found`);
    return result;
}

export function importDef (name: string, fn: Function): [string, string, Function] {
    return [name, name, fn];
}

export type JiterpreterOptions = {
    enableAll?: boolean;
    enableTraces: boolean;
    enableInterpEntry: boolean;
    enableJitCall: boolean;
    enableBackwardBranches: boolean;
    enableCallResume: boolean;
    enableWasmEh: boolean;
    // For locations where the jiterpreter heuristic says we will be unable to generate
    //  a trace, insert an entry point opcode anyway. This enables collecting accurate
    //  stats for options like estimateHeat, but raises overhead.
    disableHeuristic: boolean;
    enableStats: boolean;
    // Continue counting hits for traces that fail to compile and use it to estimate
    //  the relative importance of the opcode that caused them to abort
    estimateHeat: boolean;
    // Count the number of times a trace bails out (branch taken, etc) and for what reason
    countBailouts: boolean;
    // Dump the wasm blob for all compiled traces
    dumpTraces: boolean;
    // Use runtime imports for pointer constants
    useConstants: boolean;
    // Enable performing backward branches without exiting traces
    noExitBackwardBranches: boolean;
    // Unwrap gsharedvt wrappers when compiling jitcalls if possible
    directJitCalls: boolean;
    eliminateNullChecks: boolean;
    minimumTraceLength: number;
    minimumTraceHitCount: number;
    jitCallHitCount: number;
    jitCallFlushThreshold: number;
    interpEntryHitCount: number;
    interpEntryFlushThreshold: number;
    // Maximum total number of wasm bytes to generate
    wasmBytesLimit: number;
}

const optionNames : { [jsName: string] : string } = {
    "enableTraces": "jiterpreter-traces-enabled",
    "enableInterpEntry": "jiterpreter-interp-entry-enabled",
    "enableJitCall": "jiterpreter-jit-call-enabled",
    "enableBackwardBranches": "jiterpreter-backward-branch-entries-enabled",
    "enableCallResume": "jiterpreter-call-resume-enabled",
    "enableWasmEh": "jiterpreter-wasm-eh-enabled",
    "enableStats": "jiterpreter-stats-enabled",
    "disableHeuristic": "jiterpreter-disable-heuristic",
    "estimateHeat": "jiterpreter-estimate-heat",
    "countBailouts": "jiterpreter-count-bailouts",
    "dumpTraces": "jiterpreter-dump-traces",
    "useConstants": "jiterpreter-use-constants",
    "eliminateNullChecks": "jiterpreter-eliminate-null-checks",
    "noExitBackwardBranches": "jiterpreter-backward-branches-enabled",
    "directJitCalls": "jiterpreter-direct-jit-calls",
    "minimumTraceLength": "jiterpreter-minimum-trace-length",
    "minimumTraceHitCount": "jiterpreter-minimum-trace-hit-count",
    "jitCallHitCount": "jiterpreter-jit-call-hit-count",
    "jitCallFlushThreshold": "jiterpreter-jit-call-queue-flush-threshold",
    "interpEntryHitCount": "jiterpreter-interp-entry-hit-count",
    "interpEntryFlushThreshold": "jiterpreter-interp-entry-queue-flush-threshold",
    "wasmBytesLimit": "jiterpreter-wasm-bytes-limit",
};

let optionsVersion = -1;
let optionTable : JiterpreterOptions = <any>{};

// applies one or more jiterpreter options to change the current jiterpreter configuration.
export function applyOptions (options: JiterpreterOptions) {
    for (const k in options) {
        const info = optionNames[k];
        if (!info) {
            console.error(`Unrecognized jiterpreter option: ${k}`);
            continue;
        }

        const v = (<any>options)[k];
        if (typeof (v) === "boolean")
            cwraps.mono_jiterp_parse_option((v ? "--" : "--no-") + info);
        else if (typeof (v) === "number")
            cwraps.mono_jiterp_parse_option(`--${info}=${v}`);
        else
            console.error(`Jiterpreter option must be a boolean or a number but was ${typeof(v)} '${v}'`);
    }
}

// returns the current jiterpreter configuration. do not mutate the return value!
export function getOptions () {
    const currentVersion = cwraps.mono_jiterp_get_options_version();
    if (currentVersion !== optionsVersion) {
        updateOptions();
        optionsVersion = currentVersion;
    }
    return optionTable;
}

function updateOptions () {
    const pJson = cwraps.mono_jiterp_get_options_as_json();
    const json = Module.UTF8ToString(<any>pJson);
    Module._free(<any>pJson);
    const blob = JSON.parse(json);

    optionTable = <any>{};
    for (const k in optionNames) {
        const info = optionNames[k];
        (<any>optionTable)[k] = blob[info];
    }
}