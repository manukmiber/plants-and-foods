export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
class Form {
  title() { return this; }
  body() { return this; }
  button() { return this; }
  button1() { return this; }
  button2() { return this; }
  textField() { return this; }
  toggle() { return this; }
  dropdown() { return this; }
  slider() { return this; }
  async show() { return { canceled: true }; }
}
export class ActionFormData extends Form {}
export class ModalFormData extends Form {}
export class MessageFormData extends Form {}
