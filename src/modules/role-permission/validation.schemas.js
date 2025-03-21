// role-permission/validation.schemas.js
import Joi from 'joi';
import JoiObjectId from 'joi-objectid';
const joiObjectId = JoiObjectId(Joi);

export const rolePermissionSchemas = {
  createRolePermission: Joi.object({
    roleId: Joi.string().uuid().required(),
    permissionId: Joi.string().uuid().required(),
    conditions: Joi.object().optional()
  }),
  
  updateRolePermission: Joi.object({
    conditions: Joi.object().optional()
  }),
  
  rolePermissionParams: Joi.object({
    roleId: Joi.string().uuid().required(),
    permissionId: Joi.string().uuid().required()
  })
};