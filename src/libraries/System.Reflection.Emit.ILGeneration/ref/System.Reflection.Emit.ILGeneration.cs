// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
// ------------------------------------------------------------------------------
// Changes to this file must follow the https://aka.ms/api-review process.
// ------------------------------------------------------------------------------

namespace System.Reflection.Emit
{
    public partial class CustomAttributeBuilder
    {
        public CustomAttributeBuilder(System.Reflection.ConstructorInfo con, object?[] constructorArgs) { }
        public CustomAttributeBuilder(System.Reflection.ConstructorInfo con, object?[] constructorArgs, System.Reflection.FieldInfo[] namedFields, object?[] fieldValues) { }
        public CustomAttributeBuilder(System.Reflection.ConstructorInfo con, object?[] constructorArgs, System.Reflection.PropertyInfo[] namedProperties, object?[] propertyValues) { }
        public CustomAttributeBuilder(System.Reflection.ConstructorInfo con, object?[] constructorArgs, System.Reflection.PropertyInfo[] namedProperties, object?[] propertyValues, System.Reflection.FieldInfo[] namedFields, object?[] fieldValues) { }
    }
    public abstract class ILGenerator
    {
        protected ILGenerator() { }
        public abstract int ILOffset { get; }
        public abstract void BeginCatchBlock(System.Type? exceptionType);
        public abstract void BeginExceptFilterBlock();
        public abstract System.Reflection.Emit.Label BeginExceptionBlock();
        public abstract void BeginFaultBlock();
        public abstract void BeginFinallyBlock();
        public abstract void BeginScope();
        protected static Label CreateLabel(int id) { throw null; }
        public virtual System.Reflection.Emit.LocalBuilder DeclareLocal(System.Type localType) { throw null; }
        public abstract System.Reflection.Emit.LocalBuilder DeclareLocal(System.Type localType, bool pinned);
        public abstract System.Reflection.Emit.Label DefineLabel();
        public abstract void Emit(System.Reflection.Emit.OpCode opcode);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, byte arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, double arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, short arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, int arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, long arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.ConstructorInfo con);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.Emit.Label label);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.Emit.Label[] labels);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.Emit.LocalBuilder local);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.Emit.SignatureHelper signature);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.FieldInfo field);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Reflection.MethodInfo meth);
        [System.CLSCompliantAttribute(false)]
        public void Emit(System.Reflection.Emit.OpCode opcode, sbyte arg) { }
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, float arg);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, string str);
        public abstract void Emit(System.Reflection.Emit.OpCode opcode, System.Type cls);
        public abstract void EmitCall(System.Reflection.Emit.OpCode opcode, System.Reflection.MethodInfo methodInfo, System.Type[]? optionalParameterTypes);
        public abstract void EmitCalli(System.Reflection.Emit.OpCode opcode, System.Reflection.CallingConventions callingConvention, System.Type? returnType, System.Type[]? parameterTypes, System.Type[]? optionalParameterTypes);
        public abstract void EmitCalli(System.Reflection.Emit.OpCode opcode, System.Runtime.InteropServices.CallingConvention unmanagedCallConv, System.Type? returnType, System.Type[]? parameterTypes);
        public virtual void EmitWriteLine(System.Reflection.Emit.LocalBuilder localBuilder) { }
        public virtual void EmitWriteLine(System.Reflection.FieldInfo fld) { }
        public virtual void EmitWriteLine(string value) { }
        public abstract void EndExceptionBlock();
        public abstract void EndScope();
        public abstract void MarkLabel(System.Reflection.Emit.Label loc);
        public virtual void ThrowException([System.Diagnostics.CodeAnalysis.DynamicallyAccessedMembersAttribute(System.Diagnostics.CodeAnalysis.DynamicallyAccessedMemberTypes.PublicParameterlessConstructor)] System.Type excType) { }
        public abstract void UsingNamespace(string usingNamespace);
    }
    public readonly partial struct Label : System.IEquatable<System.Reflection.Emit.Label>
    {
        private readonly int _dummyPrimitive;
        public override bool Equals([System.Diagnostics.CodeAnalysis.NotNullWhenAttribute(true)] object? obj) { throw null; }
        public bool Equals(System.Reflection.Emit.Label obj) { throw null; }
        public override int GetHashCode() { throw null; }
        public int Id { get { throw null; } }
        public static bool operator ==(System.Reflection.Emit.Label a, System.Reflection.Emit.Label b) { throw null; }
        public static bool operator !=(System.Reflection.Emit.Label a, System.Reflection.Emit.Label b) { throw null; }
    }
    public sealed partial class LocalBuilder : System.Reflection.LocalVariableInfo
    {
        internal LocalBuilder() { }
        public override bool IsPinned { get { throw null; } }
        public override int LocalIndex { get { throw null; } }
        public override System.Type LocalType { get { throw null; } }
    }
    public abstract partial class ParameterBuilder
    {
        protected ParameterBuilder() { }
        public virtual int Attributes { get { throw null; } }
        public bool IsIn { get { throw null; } }
        public bool IsOptional { get { throw null; } }
        public bool IsOut { get { throw null; } }
        public virtual string? Name { get { throw null; } }
        public virtual int Position { get { throw null; } }
        public virtual void SetConstant(object? defaultValue) { }
        public void SetCustomAttribute(System.Reflection.ConstructorInfo con, byte[] binaryAttribute) { }
        public void SetCustomAttribute(System.Reflection.Emit.CustomAttributeBuilder customBuilder) { }
        protected abstract void SetCustomAttributeCore(System.Reflection.ConstructorInfo con, System.ReadOnlySpan<byte> binaryAttribute);
    }
    public sealed partial class SignatureHelper
    {
        internal SignatureHelper() { }
        public void AddArgument(System.Type clsArgument) { }
        public void AddArgument(System.Type argument, bool pinned) { }
        public void AddArgument(System.Type argument, System.Type[]? requiredCustomModifiers, System.Type[]? optionalCustomModifiers) { }
        public void AddArguments(System.Type[]? arguments, System.Type[][]? requiredCustomModifiers, System.Type[][]? optionalCustomModifiers) { }
        public void AddSentinel() { }
        public override bool Equals(object? obj) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetFieldSigHelper(System.Reflection.Module? mod) { throw null; }
        public override int GetHashCode() { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetLocalVarSigHelper() { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetLocalVarSigHelper(System.Reflection.Module? mod) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetMethodSigHelper(System.Reflection.CallingConventions callingConvention, System.Type? returnType) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetMethodSigHelper(System.Reflection.Module? mod, System.Reflection.CallingConventions callingConvention, System.Type? returnType) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetMethodSigHelper(System.Reflection.Module? mod, System.Type? returnType, System.Type[]? parameterTypes) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetPropertySigHelper(System.Reflection.Module? mod, System.Reflection.CallingConventions callingConvention, System.Type? returnType, System.Type[]? requiredReturnTypeCustomModifiers, System.Type[]? optionalReturnTypeCustomModifiers, System.Type[]? parameterTypes, System.Type[][]? requiredParameterTypeCustomModifiers, System.Type[][]? optionalParameterTypeCustomModifiers) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetPropertySigHelper(System.Reflection.Module? mod, System.Type? returnType, System.Type[]? parameterTypes) { throw null; }
        public static System.Reflection.Emit.SignatureHelper GetPropertySigHelper(System.Reflection.Module? mod, System.Type? returnType, System.Type[]? requiredReturnTypeCustomModifiers, System.Type[]? optionalReturnTypeCustomModifiers, System.Type[]? parameterTypes, System.Type[][]? requiredParameterTypeCustomModifiers, System.Type[][]? optionalParameterTypeCustomModifiers) { throw null; }
        public byte[] GetSignature() { throw null; }
        public override string ToString() { throw null; }
    }
}
