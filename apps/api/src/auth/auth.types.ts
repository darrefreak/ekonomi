export type JwtPayload = {
  sub: string;
  email: string;
  typ: "access";
};

export type AuthenticatedUser = {
  userId: string;
  email: string;
};
