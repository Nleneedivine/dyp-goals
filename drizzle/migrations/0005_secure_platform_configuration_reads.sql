DROP POLICY IF EXISTS "Anyone can read platform configuration" ON public.platform_configuration;
CREATE POLICY "Admins can read platform configuration"
ON public.platform_configuration
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE SELECT ON public.platform_configuration FROM anon;

CREATE OR REPLACE VIEW public.public_platform_configuration AS
SELECT accountability_lab_start_date, ui2_default
FROM public.platform_configuration
WHERE id = 'global';

REVOKE ALL ON public.public_platform_configuration FROM PUBLIC;
GRANT SELECT ON public.public_platform_configuration TO anon, authenticated;
